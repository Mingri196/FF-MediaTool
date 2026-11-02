import { useCallback, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Plus, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useSettings } from "@/settings/SettingsProvider";
import { useTasks } from "@/tasks/TaskProvider";
import { api } from "@/lib/tauri";
import { buildAudioArgs, fmtSec, type AudioSegment } from "@/audio/builder";
import { AUDIO_BIT_DEPTHS, AUDIO_CODECS, AUDIO_FORMATS, AUDIO_SAMPLE_RATES, extOfValue, formatValue } from "@/audio/formatPresets";
import { defaultAudioParams, type AudioParams } from "@/audio/types";
import { DropZone } from "@/components/shared/DropZone";
import { FileRow } from "@/components/shared/FileRow";
import { CommandPreviewCard } from "@/components/shared/CommandPreviewCard";
import { useCommandPreview, normalizeUserArgs } from "@/components/shared/useCommandPreview";
import { basename, deriveOutputPath } from "@/lib/format";
import { useRegisterPageSnapshot, useTabId, useTabInitialState } from "@/tabs/TabManager";
import type { EncoderPreset, MediaBasicInfo } from "@/types";

type AudioMode = "convert" | "split" | "concat";

/** 复制标签时复刻的音频转换页状态快照 */
interface AudioConvertSnapshot {
  input: string;
  media: MediaBasicInfo | null;
  format: string;
  output: string;
  audio: AudioParams;
  mode: AudioMode;
  presetId: string;
  extractTrack: boolean;
  trackIndex: number;
  clipStart: number;
  clipEnd: number;
  splitEvery: number;
  segments: AudioSegment[];
}

const CHANNEL_MODES = [
  { value: "none", key: "aef.channel.none" as const },
  { value: "swap", key: "aef.channel.swap" as const },
  { value: "mono", key: "aef.channel.mono" as const },
  { value: "stereo-upmix", key: "aef.channel.upmix" as const },
  { value: "downmix", key: "aef.channel.downmix" as const },
];

/** 音频转换页（PRD 4.1-4.4）：转换/提取/分割/拼接 + 音量声道处理 + 滤镜 */
export function AudioConvertPage() {
  const { t } = useI18n();
  const { settings, update } = useSettings();
  const { guardAddTask } = useTasks();
  const tabId = useTabId();

  const init = useTabInitialState<AudioConvertSnapshot>();
  const [input, setInput] = useState(init?.input ?? "");
  const [media, setMedia] = useState<MediaBasicInfo | null>(init?.media ?? null);
  const [format, setFormat] = useState(init?.format ?? "mp3");
  const [output, setOutput] = useState(init?.output ?? "");
  const [audio, setAudio] = useState<AudioParams>(init?.audio ?? defaultAudioParams);
  const [mode, setMode] = useState<AudioMode>(init?.mode ?? "convert");
  const [presetId, setPresetId] = useState(init?.presetId ?? "");

  // 转换模式
  const [extractTrack, setExtractTrack] = useState(init?.extractTrack ?? false);
  const [trackIndex, setTrackIndex] = useState(init?.trackIndex ?? 0);
  const [clipStart, setClipStart] = useState(init?.clipStart ?? 0);
  const [clipEnd, setClipEnd] = useState(init?.clipEnd ?? 0);

  // 分割
  const [splitEvery, setSplitEvery] = useState(init?.splitEvery ?? 60);

  // 拼接
  const [segments, setSegments] = useState<AudioSegment[]>(init?.segments ?? [
    { startSec: 0, endSec: -1 },
    { startSec: -1, endSec: -1 },
  ]);

  // 复制标签：聚合最新状态供 TabManager 深拷贝注入新标签
  const snapRef = useRef<AudioConvertSnapshot>({ input, media, format, output, audio, mode, presetId, extractTrack, trackIndex, clipStart, clipEnd, splitEvery, segments });
  snapRef.current = { input, media, format, output, audio, mode, presetId, extractTrack, trackIndex, clipStart, clipEnd, splitEvery, segments };
  useRegisterPageSnapshot("audio-convert", () => snapRef.current);

  const durationSec = media?.ok ? media.durationMs / 1000 : 0;

  const isVideoInput = media?.ok && media.hasVideo;

  /** 选输入 */
  const pickInput = useCallback(async (path?: string) => {
    const picked = path ?? await open({
      multiple: false,
      directory: false,
      title: t("audio.input"),
      filters: [
        { name: "Media", extensions: ["mp3", "flac", "wav", "ogg", "opus", "m4a", "aac", "wma", "aiff", "mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "ts"] },
        { name: "All", extensions: ["*"] },
      ],
    });
    if (typeof picked !== "string" || !picked) return;
    setInput(picked);
    const dir = picked.replace(/[\\/][^\\/]+$/, "");
    window.dispatchEvent(new CustomEvent("ffmt:last-input-dir", { detail: dir }));
    // 使用默认输出路径，不跟随输入目录；空路径回落 opt
    const cfgDir = settings?.outputPaths?.audioConvert;
    const defaultDir = cfgDir || (await api.getOptDir());
    const baseInput = defaultDir + "/" + basename(picked);
    setOutput(deriveOutputPath(baseInput, extOfValue(format)));
    try {
      const info = await api.mediaProbeBasic(picked);
      setMedia(info);
      setTrackIndex(0);
      // 拼接模式默认段
      if (info.ok && info.durationMs > 0) {
        const d = info.durationMs / 1000;
        setSegments([{ startSec: 0, endSec: Math.min(30, d) }, { startSec: Math.min(30, d), endSec: -1 }]);
      }
    } catch {
      setMedia(null);
    }
  }, [t, format]);
  /** 智能匹配格式 */
  const applyFormat = useCallback(
    async (value: string) => {
      setFormat(value);
      if (input) {
        const cfgDir = settings?.outputPaths?.audioConvert || (await api.getOptDir());
        const baseInput = cfgDir + "/" + basename(input);
        // 输出扩展名按映射取（wavpack → .wv）
        setOutput(deriveOutputPath(baseInput, extOfValue(value)));
      }
      const p = AUDIO_FORMATS.find((f) => formatValue(f) === value);
      if (!p) return;
      setAudio((a) => ({
        ...a,
        acodec: p.acodec,
        mode: p.mode,
        bitrateK: p.bitrateK,
        vbrQuality: p.vbrQuality,
      }));
    },
    [input],
  );

  const audioStreams = useMemo(
    () => (media?.streams ?? []).filter((s) => s.codecType === "audio"),
    [media],
  );

  // copy 判定：有损滤镜在 copy 下禁用
  const copyAudio = audio.acodec === "copy";

  // ---- 命令预览（自动生成；按模式）----
  const autoArgs = useMemo<string[] | null>(() => {
    if (!input || !output) return null;
    try {
      if (mode === "split") {
        // 分割：以首段命令作为代表预览
        if (durationSec <= 0) return null;
        const count = Math.max(2, Math.floor(durationSec / Math.max(1, splitEvery)));
        const segDur = durationSec / count;
        const firstOut = insertSuffix(output, "_01");
        return buildAudioArgs({
          input,
          output: firstOut,
          audio,
          clip: { startSec: 0, endSec: Math.min(segDur, durationSec) },
        });
      }
      if (mode === "concat") {
        const valid = segments.filter((s) => s.startSec >= 0);
        if (valid.length < 2) return null;
        return buildAudioArgs({ input, output, audio, concat: valid.map((s) => ({ ...s })) });
      }
      // convert / 提取
      return buildAudioArgs({
        input,
        output,
        audio,
        clip:
          clipStart > 0 || clipEnd > 0
            ? { startSec: clipStart, endSec: clipEnd > 0 ? clipEnd : -1 }
            : null,
        extract: extractTrack && isVideoInput ? { trackIndex } : null,
      });
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [input, output, audio, mode, clipStart, clipEnd, extractTrack, trackIndex, isVideoInput, durationSec, splitEvery, segments]);

  const cmdPreview = useCommandPreview(autoArgs);

  /** 将用户编辑的命令作为模板，替换其中的输入/输出路径后应用到具体任务 */
  const substituteCmd = (text: string, fromInput: string, fromOutput: string, toInput: string, toOutput: string): string[] => {
    let t = text;
    if (fromInput) t = t.split(fromInput).join(toInput);
    if (fromOutput) t = t.split(fromOutput).join(toOutput);
    return normalizeUserArgs(t);
  };

  /** 批量模式（分割/拼接/提取）执行：dirty 时用编辑命令逐项应用 */
  const enqueueFromPreview = (
    outs: { out: string; input: string; build: () => string[] }[],
  ) => {
    if (cmdPreview.dirty && cmdPreview.text.trim()) {
      // 用户编辑过：以编辑命令为模板，替换各任务的输入/输出路径
      const fromInput = input;
      for (const o of outs) {
        const fromOutput = autoArgs?.[autoArgs.length - 1] ?? "";
        const args = substituteCmd(cmdPreview.text, fromInput, fromOutput, o.input, o.out);
        void guardAddTask({
          name: `${basename(o.input)} → ${basename(o.out)}`,
          args,
          inputPath: o.input,
          outputPath: o.out,
        }, tabId);
      }
      return;
    }
    for (const o of outs) {
      void guardAddTask({
        name: `${basename(o.input)} → ${basename(o.out)}`,
        args: o.build(),
        inputPath: o.input,
        outputPath: o.out,
      }, tabId);
    }
  };

  // ---- 预设 ----
  const audioPresets = useMemo(
    () => (settings?.presets ?? []).filter((p) => p.category === "audio"),
    [settings?.presets],
  );

  /** 应用音频预设：回填全部音频参数与页面模式；空 id =（默认参数）重置 */
  const applyPreset = (id: string) => {
    setPresetId(id);
    const p = audioPresets.find((x) => x.id === id);
    if (!p) {
      // （默认参数）：恢复出厂默认
      setAudio(defaultAudioParams());
      setMode("convert");
      return;
    }
    const saved = p.params as Partial<AudioParams>;
    setAudio({ ...defaultAudioParams(), ...saved } as AudioParams);
    // 预设参数里可携带模式（分割/拼接/转换），一并回填
    const savedMode = (p.params as { mode?: AudioMode }).mode;
    if (savedMode === "split" || savedMode === "concat" || savedMode === "convert") {
      setMode(savedMode);
    }
  };

  /** 保存当前音频参数为预设（标记 category=audio） */
  const savePreset = () => {
    const name = window.prompt(t("audio.savePresetName"), "My Preset");
    if (!name?.trim()) return;
    const now = Date.now();
    const preset: EncoderPreset = {
      id: crypto.randomUUID(),
      name: name.trim(),
      category: "audio",
      createdAt: now,
      updatedAt: now,
      params: { ...audio, mode } as unknown as Record<string, unknown>,
    };
    update({ presets: [...(settings?.presets ?? []), preset] });
    toast.success(t("audio.presetSaved"));
  };

  const enqueueOne = (out: string, params: AudioParams, extra?: { clip?: AudioSegment | null; concat?: AudioSegment[] | null; track?: number }) => {
    const args = buildAudioArgs({
      input,
      output: out,
      audio: params,
      clip: extra?.clip ?? null,
      concat: extra?.concat ?? null,
      extract: extra?.track !== undefined ? { trackIndex: extra.track } : null,
    });
    void guardAddTask({
      name: `${basename(input)} → ${basename(out)}`,
      args,
      inputPath: input,
      outputPath: out,
    }, tabId);
  };

  /** 转换 / 提取 */
  const startConvert = () => {
    if (!input || !output) return;
    // 用户编辑过 → 直接用编辑后的命令
    if (cmdPreview.dirty && cmdPreview.text.trim()) {
      void guardAddTask({
        name: `${basename(input)} → ${basename(output)}`,
        args: cmdPreview.getArgs(),
        inputPath: input,
        outputPath: output,
      }, tabId);
      return;
    }
    enqueueOne(output, audio, {
      clip:
        clipStart > 0 || clipEnd > 0
          ? { startSec: clipStart, endSec: clipEnd > 0 ? clipEnd : -1 }
          : null,
      track: extractTrack && isVideoInput ? trackIndex : undefined,
    });
  };

  /** 分割：按每段时长切分 → 批量入队 */
  const startSplit = () => {
    if (!input || durationSec <= 0) return;
    const count = Math.max(2, Math.floor(durationSec / Math.max(1, splitEvery)));
    const segDur = durationSec / count;
    const params = audio;
    const outs = Array.from({ length: count }, (_, i) => {
      const start = i * segDur;
      const end = i === count - 1 ? durationSec : (i + 1) * segDur;
      const out = insertSuffix(output, `_${String(i + 1).padStart(2, "0")}`);
      return {
        out,
        input,
        build: () =>
          buildAudioArgs({
            input,
            output: out,
            audio: params,
            clip: { startSec: start, endSec: end },
          }),
      };
    });
    enqueueFromPreview(outs);
  };

  /** 拼接 */
  const startConcat = () => {
    if (!input || segments.length < 2) return;
    const valid = segments.filter((s) => s.startSec >= 0);
    if (valid.length < 2) return;
    // 用户编辑过 → 直接用编辑后的命令
    if (cmdPreview.dirty && cmdPreview.text.trim()) {
      void guardAddTask({
        name: `${basename(input)} → ${basename(output)}`,
        args: cmdPreview.getArgs(),
        inputPath: input,
        outputPath: output,
      }, tabId);
      return;
    }
    enqueueOne(output, audio, { concat: valid.map((s) => ({ ...s })) });
  };

  const addSegment = () => {
    const lastEnd = segments[segments.length - 1].endSec;
    const start = lastEnd >= 0 ? lastEnd : durationSec * 0.5;
    setSegments([...segments, { startSec: start, endSec: -1 }]);
  };

  const renderSplitPreview = useMemo(() => {
    if (durationSec <= 0) return 0;
    return Math.max(1, Math.floor(durationSec / Math.max(1, splitEvery)));
  }, [durationSec, splitEvery]);

  return (
    <DropZone onFiles={([path]) => path && void pickInput(path)} accept="audio" className="h-full">
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">{t("audio.title")}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("audio.desc")}</p>
          </div>
          {/* 预设快速调用（与视频转换页一致） */}
          <div className="flex items-center gap-2">
            <Select value={presetId} onValueChange={(v) => v !== null && applyPreset(v)}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder={t("audio.presetNone")}>
                  {(val) => {
                    const p = audioPresets.find((x) => x.id === val);
                    return p ? p.name : t("audio.presetNone");
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t("audio.presetNone")}</SelectItem>
                {audioPresets.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={savePreset} title={t("audio.savePreset")}>
              <Save className="size-4" />
            </Button>
          </div>
        </div>

        {/* 输入 / 格式 / 输出 */}
        <Card>
          <CardContent className="space-y-4 pt-6">
            <FileRow label={t("audio.input")} value={input} onBrowse={() => void pickInput()} readOnly />
            {media?.ok && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{fmtSec(durationSec)}</Badge>
                {audioStreams.map((s, i) => (
                  <Badge key={i} variant="outline">
                    {s.codecName} {s.sampleRate ? `${s.sampleRate}Hz` : ""}
                    {s.channels ? `${s.channels}ch` : ""}
                  </Badge>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>{t("audio.format")}</Label>
                <Select value={format} onValueChange={(v) => v !== null && applyFormat(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(val: string) => {
                        const f = AUDIO_FORMATS.find((x) => formatValue(x) === val);
                        return f ? t(f.label) : "";
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {AUDIO_FORMATS.map((f) => (
                      <SelectItem key={f.ext} value={formatValue(f)}>{t(f.label)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>{t("audio.outputPath")}</Label>
                <Input type="text" value={output} onChange={(e) => setOutput(e.target.value)} placeholder="opt" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("audio.losslessHint")}</p>

            {/* 模式切换 */}
            <div className="flex items-center gap-2">
              <Label>{t("audio.mode")}</Label>
              <Button type="button" size="sm" variant={mode === "convert" ? "default" : "outline"} onClick={() => setMode("convert")}>
                {t("audio.mode.convert")}
              </Button>
              <Button type="button" size="sm" variant={mode === "split" ? "default" : "outline"} onClick={() => setMode("split")}>
                {t("audio.mode.split")}
              </Button>
              <Button type="button" size="sm" variant={mode === "concat" ? "default" : "outline"} onClick={() => setMode("concat")}>
                {t("audio.mode.concat")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 模式内容 */}
        <Card>
          <CardContent className="space-y-4 pt-6">
            {mode === "convert" && (
              <>
                {isVideoInput && (
                  <div className="space-y-2 rounded-md border border-border p-3">
                    <div className="flex items-center gap-2">
                      <Checkbox id="extract" checked={extractTrack} onCheckedChange={(c) => setExtractTrack(!!c)} />
                      <Label htmlFor="extract" className="cursor-pointer">{t("audio.extractTrack")}</Label>
                    </div>
                    {extractTrack && (
                      <div className="flex items-center gap-2">
                        <Label className="w-16 shrink-0 text-xs">{t("audio.track")}</Label>
                        <Select
                          value={String(trackIndex)}
                          onValueChange={(v) => v !== null && setTrackIndex(Number(v))}
                          items={{
                            "-1": t("audio.allTracks"),
                            ...Object.fromEntries(audioStreams.map((s, i) => [String(i), `#${i + 1} ${s.codecName} ${s.channels ? `${s.channels}ch` : ""}`])),
                          }}
                        >
                          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="-1">{t("audio.allTracks")}</SelectItem>
                            {audioStreams.map((s, i) => (
                              <SelectItem key={i} value={String(i)}>
                                #{i + 1} {s.codecName} {s.channels ? `${s.channels}ch` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>{t("audio.clipStart")}</Label>
                    <Input type="number" min={0} step={1} value={clipStart || ""} placeholder="0"
                      onChange={(e) => setClipStart(Math.max(0, Number(e.target.value) || 0))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("audio.clipEnd")}</Label>
                    <Input type="number" min={0} step={1} value={clipEnd || ""} placeholder="0"
                      onChange={(e) => setClipEnd(Math.max(0, Number(e.target.value) || 0))} />
                  </div>
                </div>
              </>
            )}

            {mode === "split" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <Label>{t("audio.splitEvery")}（共 {durationSec > 0 ? renderSplitPreview : "—"} 段）</Label>
                    <span className="text-xs text-muted-foreground">{splitEvery}s</span>
                  </div>
                  <Slider
                    min={5}
                    max={Math.max(10, Math.floor(durationSec || 300))}
                    step={5}
                    value={[splitEvery]}
                    onValueChange={(v) => {
                      const n = Array.isArray(v) ? v[0] : v;
                      if (n !== undefined) setSplitEvery(Math.round(n));
                    }}
                  />
                </div>
                <p className="col-span-2 text-xs text-muted-foreground">
                  {t("audio.splitPreview", { count: renderSplitPreview })}
                </p>
              </div>
            )}

            {mode === "concat" && (
              <div className="space-y-2">
                {segments.map((seg, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                    <span className="w-5 text-center text-sm text-muted-foreground">{i + 1}</span>
                    <span className="text-xs text-muted-foreground">{t("audio.clipStart")}</span>
                    <Input
                      className="h-8 w-24 font-mono text-xs"
                      type="number"
                      min={0}
                      step={1}
                      value={seg.startSec < 0 ? "" : seg.startSec}
                      placeholder={t("common.auto")}
                      onChange={(e) => {
                        const n = Math.max(0, Number(e.target.value) || -1);
                        setSegments((prev) => prev.map((s, j) => (j === i ? { ...s, startSec: n } : s)));
                      }}
                    />
                    <span className="text-xs text-muted-foreground">{t("audio.clipEnd")}</span>
                    <Input
                      className="h-8 w-24 font-mono text-xs"
                      type="number"
                      min={0}
                      step={1}
                      value={seg.endSec < 0 ? "" : seg.endSec}
                      placeholder={t("clip.endToEnd")}
                      onChange={(e) => {
                        const n = Math.max(0, Number(e.target.value) || -1);
                        setSegments((prev) => prev.map((s, j) => (j === i ? { ...s, endSec: n } : s)));
                      }}
                    />
                    <Button variant="ghost" size="icon" className="size-7 ml-auto text-destructive" disabled={segments.length <= 2}
                      onClick={() => setSegments((prev) => prev.filter((_, j) => j !== i))}>
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
          </CardContent>
        </Card>

        {/* 编码参数 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("audio.vcodec")}</CardTitle>
            <CardDescription />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {AUDIO_CODECS.map((c) => (
                <Button
                  key={c.value}
                  type="button"
                  size="sm"
                  variant={audio.acodec === c.value ? "default" : "outline"}
                  onClick={() => {
                    // 切 copy：强制 lossless 模式（copy 无质量概念）
                    setAudio({ ...audio, acodec: c.value, mode: c.value === "copy" ? "lossless" : audio.mode });
                  }}
                >
                  {t(c.labelKey)}
                </Button>
              ))}
            </div>

            <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-3", copyAudio && "pointer-events-none opacity-50")}>
              <div className="space-y-1.5">
                <Label>{t("audio.qualityMode")}</Label>
                <Select
                  value={audio.mode}
                  onValueChange={(v) => v !== null && setAudio({ ...audio, mode: v as AudioParams["mode"] })}
                  items={{ cbr: t("audio.mode.cbr"), vbr: t("audio.mode.vbr"), lossless: t("audio.mode.lossless") }}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cbr">{t("audio.mode.cbr")}</SelectItem>
                    <SelectItem value="vbr">{t("audio.mode.vbr")}</SelectItem>
                    <SelectItem value="lossless">{t("audio.mode.lossless")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {audio.mode === "cbr" ? (
                <div className="space-y-1.5">
                  <Label>{t("audio.bitrate")}</Label>
                  <Input type="number" min={32} step={16} value={audio.bitrateK || ""}
                    onChange={(e) => setAudio({ ...audio, bitrateK: Math.max(0, Number(e.target.value) || 0) })} />
                </div>
              ) : audio.mode === "vbr" ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <Label>{t("audio.vbrQuality")}</Label>
                    <span className="text-xs text-muted-foreground">{audio.vbrQuality}</span>
                  </div>
                  <Slider min={0} max={9} step={1} value={[audio.vbrQuality]}
                    onValueChange={(v) => {
                      const n = Array.isArray(v) ? v[0] : v;
                      if (n !== undefined) setAudio({ ...audio, vbrQuality: Math.round(n) });
                    }} />
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline">{t("audio.mode.lossless")}</Badge>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{t("audio.sampleRate")}</Label>
                <Select value={String(audio.sampleRate || 0)}
                  onValueChange={(v) => v !== null && setAudio({ ...audio, sampleRate: Number(v) })}
                  items={{ "0": t("common.auto"), ...Object.fromEntries(AUDIO_SAMPLE_RATES.map((r) => [String(r), `${r} Hz`])) }}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t("common.auto")}</SelectItem>
                    {AUDIO_SAMPLE_RATES.map((r) => (
                      <SelectItem key={r} value={String(r)}>{r} Hz</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("audio.bitDepth")}</Label>
                <Select value={String(audio.bitDepth || 0)}
                  onValueChange={(v) => v !== null && setAudio({ ...audio, bitDepth: Number(v) })}
                  items={{ "0": t("common.auto"), ...Object.fromEntries(AUDIO_BIT_DEPTHS.map((b) => [String(b), `${b} bit`])) }}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t("common.auto")}</SelectItem>
                    {AUDIO_BIT_DEPTHS.map((b) => (
                      <SelectItem key={b} value={String(b)}>{b} bit</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("audio.channels")}</Label>
                <Select value={String(audio.channels || 0)}
                  onValueChange={(v) => v !== null && setAudio({ ...audio, channels: Number(v) })}
                  items={{
                    "0": t("video.channels.auto"), "1": t("video.channels.mono"), "2": t("video.channels.stereo"),
                    "6": t("video.channels.51"), "8": t("video.channels.71"),
                  }}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t("video.channels.auto")}</SelectItem>
                    <SelectItem value="1">{t("video.channels.mono")}</SelectItem>
                    <SelectItem value="2">{t("video.channels.stereo")}</SelectItem>
                    <SelectItem value="6">{t("video.channels.51")}</SelectItem>
                    <SelectItem value="8">{t("video.channels.71")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 音量 / 声道 / 滤镜 */}
        <Card className={cn(copyAudio && "opacity-60")}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {t("aef.volume")} / {t("aef.channel")} / {t("video.sectionFilters")}
              {copyAudio && <Badge variant="destructive" className="ml-2 text-[10px]">{t("codec.copyHint")}</Badge>}
            </CardTitle>
            <CardDescription />
          </CardHeader>
          <CardContent className={cn("space-y-5", copyAudio && "pointer-events-none opacity-50")}>
            {/* 音量 */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <Label>{t("aef.gain")}</Label>
                  <span className="text-xs text-muted-foreground">{audio.gainDb > 0 ? "+" : ""}{audio.gainDb} dB</span>
                </div>
                <Slider min={-30} max={30} step={1} value={[audio.gainDb]}
                  onValueChange={(v) => {
                    const n = Array.isArray(v) ? v[0] : v;
                    if (n !== undefined) setAudio({ ...audio, gainDb: n });
                  }} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("aef.fadeIn")}</Label>
                <Input type="number" min={0} step={0.5} value={audio.fadeInSec || ""}
                  onChange={(e) => setAudio({ ...audio, fadeInSec: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("aef.fadeOut")}</Label>
                <Input type="number" min={0} step={0.5} value={audio.fadeOutSec || ""}
                  onChange={(e) => setAudio({ ...audio, fadeOutSec: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="loudnorm" checked={audio.loudnorm} onCheckedChange={(c) => setAudio({ ...audio, loudnorm: !!c })} />
              <Label htmlFor="loudnorm" className="cursor-pointer">{t("aef.loudnorm")}</Label>
            </div>

            {/* 声道 */}
            <div className="space-y-1.5">
              <Label>{t("aef.channel")}</Label>
              <div className="flex flex-wrap gap-1.5">
                {CHANNEL_MODES.map((m) => (
                  <Button key={m.value} type="button" size="sm"
                    variant={audio.channelMode === m.value ? "default" : "outline"}
                    onClick={() => setAudio({ ...audio, channelMode: m.value as AudioParams["channelMode"] })}>
                    {t(m.key)}
                  </Button>
                ))}
              </div>
            </div>

            {/* 滤镜开关 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <Checkbox id="a-denoise" checked={audio.denoise} onCheckedChange={(c) => setAudio({ ...audio, denoise: !!c })} />
                <Label htmlFor="a-denoise" className="cursor-pointer">{t("aef.denoise")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="a-vocal" checked={audio.vocalRemoval} onCheckedChange={(c) => setAudio({ ...audio, vocalRemoval: !!c })} />
                <Label htmlFor="a-vocal" className="cursor-pointer">{t("aef.vocal")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="a-reverb" checked={audio.reverb} onCheckedChange={(c) => setAudio({ ...audio, reverb: !!c })} />
                <Label htmlFor="a-reverb" className="cursor-pointer">{t("aef.reverb")}</Label>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <Label>{t("aef.tempo")}</Label>
                  <span className="text-xs text-muted-foreground">{audio.tempo.toFixed(2)}x</span>
                </div>
                <Slider min={0.5} max={2} step={0.05} value={[audio.tempo]}
                  onValueChange={(v) => {
                    const n = Array.isArray(v) ? v[0] : v;
                    if (n !== undefined) setAudio({ ...audio, tempo: Math.round(n * 100) / 100 });
                  }} />
              </div>
            </div>

            {/* EQ */}
            <div className="space-y-3 rounded-md border border-border p-3">
              <Label>{t("aef.eq")}</Label>
              {(
                [
                  { k: "aef.eqBass" as const, v: audio.eqBass },
                  { k: "aef.eqMid" as const, v: audio.eqMid },
                  { k: "aef.eqTreble" as const, v: audio.eqTreble },
                ]
              ).map((row) => (
                <div key={row.k} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-xs">{t(row.k)}</span>
                  <Slider min={-12} max={12} step={1} value={[row.v]}
                    onValueChange={(val) => {
                      const n = Array.isArray(val) ? val[0] : val;
                      if (n === undefined) return;
                      if (row.k === "aef.eqBass") setAudio({ ...audio, eqBass: n });
                      else if (row.k === "aef.eqMid") setAudio({ ...audio, eqMid: n });
                      else setAudio({ ...audio, eqTreble: n });
                    }}
                    className="flex-1" />
                  <span className="w-10 shrink-0 text-right font-mono text-xs text-muted-foreground">{row.v > 0 ? "+" : ""}{row.v}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 命令预览 + 操作（可编辑 textarea） */}
        <CommandPreviewCard
          value={cmdPreview.text}
          onEdit={cmdPreview.setText}
          startLabelKey="audio.start"
          onStart={() => {
            if (mode === "split") startSplit();
            else if (mode === "concat") startConcat();
            else startConvert();
          }}
          startDisabled={
            !input ||
            (mode === "convert" && !output) ||
            (mode === "split" && durationSec <= 0) ||
            (mode === "concat" && segments.filter((s) => s.startSec >= 0).length < 2)
          }
          onCopy={() => {
            void navigator.clipboard.writeText(cmdPreview.text);
            toast.success(t("common.done"));
          }}
          copyDisabled={!autoArgs}
          overwriteOpen={cmdPreview.overwriteOpen}
          overwriteText={cmdPreview.pendingText}
          onConfirmOverwrite={cmdPreview.confirmOverwrite}
          onCancelOverwrite={cmdPreview.cancelOverwrite}
          empty={!autoArgs}
        />
      </div>
      </div>
    </DropZone>
  );
}

/** 在扩展名前插入后缀：song.mp3 + "_01" → song_01.mp3 */
function insertSuffix(path: string, suffix: string): string {
  const dot = path.lastIndexOf(".");
  const slash = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  if (dot > slash) {
    return path.slice(0, dot) + suffix + path.slice(dot);
  }
  return path + suffix;
}