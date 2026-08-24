import { useCallback, useEffect, useMemo, useState } from "react";
import { open, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { Plus, Play, Trash2, ScanSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useTasks } from "@/tasks/TaskProvider";
import { api } from "@/lib/tauri";
import { buildVideoArgs, fmtSec, parseTimeToSec, type ClipRange } from "@/video/builder";
import { defaultVideoAudioParams, defaultVideoParams, type VideoParams } from "@/video/types";
import { TimelineRange } from "@/components/video/TimelineRange";
import { VideoEncodeSection } from "@/components/video/VideoEncodeSection";
import { FileRow } from "@/components/shared/FileRow";
import { basename, deriveOutputPath } from "@/lib/format";

type ClipMode = "trim" | "concat";

interface Segment {
  id: string;
  startSec: number;
  endSec: number; // -1 = 到结尾
}

/** 视频剪辑页（PRD 3.2）：时间裁剪 + 多片段拼接 + 画面处理（旋转/翻转/裁剪） */
export function VideoClipPage() {
  const { t } = useI18n();
  const { addTask } = useTasks();

  const [input, setInput] = useState("");
  const [durationSec, setDurationSec] = useState(0);
  const [mode, setMode] = useState<ClipMode>("trim");
  const [segments, setSegments] = useState<Segment[]>([
    { id: crypto.randomUUID(), startSec: 0, endSec: -1 },
  ]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [output, setOutput] = useState("");
  const [video, setVideo] = useState<VideoParams>(defaultVideoParams);
  const [audio, setAudio] = useState(defaultVideoAudioParams);

  const pickInput = useCallback(async () => {
    const picked = await open({
      multiple: false,
      directory: false,
      title: t("clip.input"),
    });
    if (typeof picked !== "string" || !picked) return;
    setInput(picked);
    setOutput(deriveOutputPath(picked, "mp4"));
    const dir = picked.replace(/[\\/][^\\/]+$/, "");
    window.dispatchEvent(new CustomEvent("ffmt:last-input-dir", { detail: dir }));
    try {
      const info = await api.mediaProbeBasic(picked);
      const dur = info.durationMs / 1000;
      setDurationSec(dur);
      setSegments([{ id: crypto.randomUUID(), startSec: 0, endSec: -1 }]);
      setActiveIdx(0);
    } catch {
      setDurationSec(0);
    }
  }, [t]);

  const active = segments[activeIdx] ?? segments[0];

  const updateActive = (patch: Partial<Segment>) => {
    setSegments((prev) =>
      prev.map((s, i) => (i === activeIdx ? { ...s, ...patch } : s)),
    );
  };

  const addSegment = () => {
    const last = segments[segments.length - 1];
    const start = last.endSec >= 0 ? last.endSec : Math.max(0, durationSec - 10);
    const seg: Segment = { id: crypto.randomUUID(), startSec: start, endSec: -1 };
    const list = [...segments, seg];
    setSegments(list);
    setActiveIdx(list.length - 1);
  };

  const removeSegment = (id: string) => {
    if (segments.length <= 1) return;
    const list = segments.filter((s) => s.id !== id);
    setSegments(list);
    setActiveIdx(Math.min(activeIdx, list.length - 1));
  };

  // ---------- 命令生成 ----------
  const clipSegments = useMemo(() => {
    if (mode === "trim") return null;
    return segments.map((s) => ({ startSec: s.startSec, endSec: s.endSec } satisfies ClipRange));
  }, [mode, segments]);

  const trimRange: ClipRange | null = useMemo(() => {
    if (mode !== "trim") return null;
    return { startSec: active.startSec, endSec: active.endSec };
  }, [mode, active]);

  const args = useMemo(() => {
    if (!input || !output) return null;
    try {
      return buildVideoArgs({ input, output, video, audio, clip: trimRange, concat: clipSegments });
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [input, output, video, audio, trimRange, clipSegments]);

  const canStart = !!args && !!input && !!output && (mode === "trim" || segments.length >= 2);

  const start = () => {
    if (!input || !output || !canStart) return;
    void addTask({
      name: `${basename(input)} → ${basename(output)}`,
      args: args!,
      inputPath: input,
      outputPath: output,
    });
  };

  const pickOutput = async () => {
    const picked = await saveDialog({ title: t("clip.output"), defaultPath: output });
    if (typeof picked === "string" && picked) setOutput(picked);
  };

  const cycleToNext = () => {
    const next = (activeIdx + 1) % segments.length;
    setActiveIdx(next);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-5 p-6">
        <div>
          <h1 className="text-xl font-semibold">{t("clip.title")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("clip.desc")}</p>
        </div>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <FileRow label={t("clip.input")} value={input} onBrowse={() => void pickInput()} readOnly />

            {/* 模式选择 */}
            <div className="flex items-center gap-2">
              <Label>{t("clip.mode")}</Label>
              <Button
                type="button"
                size="sm"
                variant={mode === "trim" ? "default" : "outline"}
                onClick={() => setMode("trim")}
              >
                {t("clip.mode.trim")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "concat" ? "default" : "outline"}
                onClick={() => setMode("concat")}
              >
                {t("clip.mode.concat")}
              </Button>
              <span className="ml-auto text-xs text-muted-foreground">
                {t("clip.duration")}: {durationSec > 0 ? fmtSec(durationSec) : "—"}
              </span>
            </div>

            {/* 片段列表（拼接模式） */}
            {mode === "concat" && (
              <div className="space-y-2">
                {segments.map((seg, idx) => (
                  <div
                    key={seg.id}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-2 py-1.5",
                      idx === activeIdx && "border-primary/60 bg-primary/5",
                    )}
                  >
                    <button type="button" className="w-5 text-center text-sm" onClick={() => setActiveIdx(idx)}>
                      {idx + 1}
                    </button>
                    <SegmentTimeInputs
                      seg={seg}
                      durationSec={durationSec}
                      onChange={(patch) => {
                        setSegments((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive"
                      disabled={segments.length <= 1}
                      onClick={() => removeSegment(seg.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addSegment}>
                  <Plus className="size-3.5" />
                  {t("clip.addSegment")}
                </Button>
              </div>
            )}

            {/* 时间裁剪：时间轴 + 时间输入 */}
            {mode === "trim" && durationSec > 0 && (
              <div className="space-y-3">
                <TimelineRange
                  durationSec={durationSec}
                  startSec={active.startSec}
                  endSec={active.endSec}
                  onChange={(s, e) => updateActive({ startSec: s, endSec: e })}
                />
                <p className="text-xs text-muted-foreground">{t("clip.trimHint")}</p>
              </div>
            )}

            {/* 输出 */}
            <FileRow label={t("clip.output")} value={output} onBrowse={() => void pickOutput()} onChange={setOutput} />
          </CardContent>
        </Card>

        {/* 画面处理 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("clip.rotate")} / {t("clip.flip")} / {t("clip.cropEnable")}</CardTitle>
            <CardDescription />
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{t("clip.rotate")}</Label>
              <RotateControl
                value={video.rotate}
                onChange={(v) => video.rotate === v ? ({} as never) : setVideo({ ...video, rotate: v })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("clip.flip")}</Label>
              <FlipControl value={video.flip} onChange={(v) => setVideo({ ...video, flip: v })} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label className="cursor-pointer">{t("clip.cropEnable")}</Label>
                {video.crop && <Badge variant="outline" className="font-mono">{video.crop.w}×{video.crop.h}</Badge>}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (video.crop) {
                    setVideo({ ...video, crop: null });
                  } else {
                    void (async () => {
                      try {
                        const c = await api.detectCrop(input);
                        setVideo({ ...video, crop: c, cropDetected: null });
                        toast.success(t("filter.cropDetectDone", { w: c.w, h: c.h, x: c.x, y: c.y }));
                      } catch {
                        toast.error(t("filter.cropDetectFail"));
                      }
                    })();
                  }
                }}
              >
                <ScanSearch className="size-3.5" />
                {video.crop ? t("filter.cropClear") : t("filter.cropDetectRun")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 编码设置 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("clip.encodeSettings")}</CardTitle>
            <CardDescription />
          </CardHeader>
          <CardContent>
            <VideoEncodeSection
              video={video}
              audio={audio}
              onVideoChange={setVideo}
              onAudioChange={setAudio}
            />
          </CardContent>
        </Card>

        <Separator />

        {/* 命令预览 + 提交 */}
        <Card>
          <CardContent className="space-y-3 pt-6">
            {args ? (
              <div className="max-h-32 overflow-y-auto rounded-md bg-muted/60 p-3 font-mono text-xs leading-5">
                {args.map((a, i) => (
                  <span key={i} className="whitespace-pre-wrap break-all">
                    {a}
                    {i < args.length - 1 ? " " : ""}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("video.previewHint")}</p>
            )}
            <div className="flex items-center gap-2">
              <Button onClick={start} disabled={!canStart}>
                <Play className="size-4" />
                {t("clip.generate")}
              </Button>
              {mode === "trim" && segments.length > 1 && (
                <Button variant="outline" onClick={cycleToNext}>{t("clip.cycleNext")}</Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** 片段时间输入（拼接模式每段一行） */
function SegmentTimeInputs({
  seg,
  durationSec,
  onChange,
}: {
  seg: Segment;
  durationSec: number;
  onChange: (patch: Partial<Segment>) => void;
}) {
  const { t } = useI18n();
  const parse = (v: string) => parseTimeToSec(v);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <TimeField
        label={t("clip.start")}
        value={seg.startSec}
        onCommit={(v) => onChange({ startSec: Math.min(v, seg.endSec > 0 ? seg.endSec - 0.1 : durationSec) })}
        parse={parse}
      />
      <span className="text-muted-foreground">→</span>
      <TimeField
        label={t("clip.end")}
        value={seg.endSec}
        onCommit={(v) => onChange({ endSec: v >= durationSec - 0.05 ? -1 : v })}
        parse={parse}
        endOfVideo={seg.endSec < 0}
      />
    </div>
  );
}

function TimeField({
  label,
  value,
  onCommit,
  parse,
  endOfVideo,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  parse: (s: string) => number | null;
  endOfVideo?: boolean;
}) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!endOfVideo) setText(fmtSec(value));
  }, [value, endOfVideo]);
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        className="h-8 w-24 font-mono text-xs"
        value={endOfVideo ? "" : text}
        placeholder={endOfVideo ? "…" : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const v = parse(text);
          if (v !== null) onCommit(v);
          else if (!endOfVideo) setText(fmtSec(value));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const v = parse(text);
            if (v !== null) onCommit(v);
          }
        }}
      />
    </div>
  );
}

function RotateControl({
  value,
  onChange,
}: {
  value: VideoParams["rotate"];
  onChange: (v: VideoParams["rotate"]) => void;
}) {
  const { t } = useI18n();
  return (
    <select
      className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value as VideoParams["rotate"])}
    >
      <option value="none">{t("filter.rotate.none")}</option>
      <option value="90">{t("filter.rotate.90")}</option>
      <option value="180">{t("filter.rotate.180")}</option>
      <option value="270">{t("filter.rotate.270")}</option>
      <option value="custom">{t("filter.rotate.custom")}</option>
    </select>
  );
}

function FlipControl({
  value,
  onChange,
}: {
  value: VideoParams["flip"];
  onChange: (v: VideoParams["flip"]) => void;
}) {
  const { t } = useI18n();
  return (
    <select
      className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value as VideoParams["flip"])}
    >
      <option value="none">{t("filter.flip.none")}</option>
      <option value="h">{t("filter.flip.h")}</option>
      <option value="v">{t("filter.flip.v")}</option>
    </select>
  );
}