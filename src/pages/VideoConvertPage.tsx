import { useCallback, useEffect, useMemo, useState } from "react";
import { open, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { Play, Save, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useSettings } from "@/settings/SettingsProvider";
import { useTasks } from "@/tasks/TaskProvider";
import { api } from "@/lib/tauri";
import { buildVideoArgs } from "@/video/builder";
import { VIDEO_FORMATS } from "@/video/formatPresets";
import { defaultVideoAudioParams, defaultVideoParams, type VideoParams } from "@/video/types";
import { FilterSection } from "@/components/video/FilterSection";
import { VideoEncodeSection } from "@/components/video/VideoEncodeSection";
import { DropZone } from "@/components/shared/DropZone";
import { FileRow } from "@/components/shared/FileRow";
import { basename, deriveOutputPath, formatMs } from "@/lib/format";
import type { EncoderPreset, MediaBasicInfo } from "@/types";

/**
 * 视频转换页（PRD 3.1 / 3.3 / 3.4）：
 * - 全格式转换 + 格式智能匹配默认编码器（可手动覆盖）
 * - 编码参数全配置 + 滤镜与增强（copy 模式自动灰化）
 * - 命令预览、保存为预设、加入任务队列
 */
export function VideoConvertPage() {
  const { t } = useI18n();
  const { settings, update } = useSettings();
  const { guardAddTask } = useTasks();

  const [input, setInput] = useState("");
  const [media, setMedia] = useState<MediaBasicInfo | null>(null);
  const [probing, setProbing] = useState(false);
  const [format, setFormat] = useState("mp4");
  const [output, setOutput] = useState("");
  const [video, setVideo] = useState<VideoParams>(defaultVideoParams);
  const [audio, setAudio] = useState(defaultVideoAudioParams);
  const [presetId, setPresetId] = useState("");
  const [preview, setPreview] = useState<string[] | null>(null);

  const lastOutputDir = settings?.lastOutputDir ?? null;

  // ---- 输入选择：自动读取媒体信息 ----
  const pickInput = useCallback(
    async (path?: string) => {
      const picked =
        path ??
        (await open({
          multiple: false,
          directory: false,
          title: t("video.input"),
          filters: [
            { name: "Media", extensions: ["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "ts", "m4v", "mpg", "mpeg", "3gp", "mts", "m2ts", "vob"] },
            { name: "All", extensions: ["*"] },
          ],
        }));
      if (typeof picked !== "string" || !picked) return;
      setInput(picked);
      // 记忆最近输入目录
      const dir = picked.replace(/[\\/][^\\/]+$/, "");
      if (dir !== lastOutputDir) {
        window.dispatchEvent(new CustomEvent("ffmt:last-input-dir", { detail: dir }));
      }
      // 自动生成输出（沿用上次输出目录或输入目录）
      const baseInput = joinPath(lastOutputDir ?? dir, basename(picked));
      setOutput(deriveOutputPath(baseInput, format));
      // 读取媒体信息
      setProbing(true);
      try {
        const info = await api.mediaProbeBasic(picked);
        setMedia(info);
        // 根据源帧率/尺寸初始化缩放默认（如 4K → 1080p 提示由用户自行选择）
      } catch (e) {
        console.error(e);
        setMedia(null);
      } finally {
        setProbing(false);
      }
    },
    [t, format, lastOutputDir],
  );

  /** 智能匹配：切换输出格式 → 应用推荐编码器/质量/音频默认（PRD 3.1） */
  const applyFormat = useCallback(
    (ext: string) => {
      setFormat(ext);
      setOutput((prev) => (input ? deriveOutputPath(input, ext) : prev));
      const preset = VIDEO_FORMATS.find((f) => f.ext === ext);
      if (!preset) return;
      setVideo((v) => ({
        ...v,
        vcodec: preset.vcodec,
        qualityMode: preset.qualityMode,
        crf: preset.crf,
        bitrateK: preset.bitrateK,
      }));
      setAudio((a) => ({
        ...a,
        acodec: preset.audio.acodec,
        bitrateK: preset.audio.bitrateK,
      }));
    },
    [input],
  );

  // ---- 输出路径 ----
  const pickOutput = async () => {
    const picked = await saveDialog({
      title: t("video.outputPath"),
      defaultPath: output || undefined,
    });
    if (typeof picked === "string" && picked) {
      setOutput(picked);
      const dir = picked.replace(/[\\/][^\\/]+$/, "");
      update({ lastOutputDir: dir });
    }
  };

  // 输入变化时记忆输出目录
  useEffect(() => {
    if (output) {
      const dir = output.replace(/[\\/][^\\/]+$/, "");
      if (dir && dir !== settings?.lastOutputDir) {
        update({ lastOutputDir: dir });
      }
    }
  }, [output]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 命令预览（实时） ----
  useEffect(() => {
    if (!input || !output) {
      setPreview(null);
      return;
    }
    try {
      const args = buildVideoArgs({ input, output, video, audio });
      setPreview(args);
    } catch (e) {
      console.error(e);
      setPreview(null);
    }
  }, [input, output, video, audio]);

  const copyDisabled = video.vcodec === "copy";

  // ---- 预设 ----
  const videoPresets = useMemo(
    () => (settings?.presets ?? []).filter((p) => p.category === "video"),
    [settings?.presets],
  );

  const applyPreset = useCallback(
    (id: string) => {
      setPresetId(id);
      const p = videoPresets.find((x) => x.id === id);
      if (!p) return;
      const params = p.params as Partial<VideoParams> | undefined;
      if (params) {
        setVideo({ ...defaultVideoParams(), ...params });
        if (params.vcodec === "copy") {
          // copy 预设：音频保持默认
        }
      }
    },
    [videoPresets],
  );

  const savePreset = () => {
    const name = window.prompt(t("video.savePresetName"), "My Preset");
    if (!name?.trim()) return;
    const now = Date.now();
    const preset: EncoderPreset = {
      id: crypto.randomUUID(),
      name: name.trim(),
      category: "video",
      createdAt: now,
      updatedAt: now,
      params: { ...video } as unknown as Record<string, unknown>,
    };
    update({ presets: [...(settings?.presets ?? []), preset] });
    toast.success(t("video.presetSaved"));
  };

  // ---- 开始 ----
  const start = () => {
    if (!input || !output) return;
    const args = buildVideoArgs({ input, output, video, audio });
    void guardAddTask({
      name: `${basename(input)} → ${basename(output)}`,
      args,
      inputPath: input,
      outputPath: output,
    });
    update({ lastOutputDir: output.replace(/[\\/][^\\/]+$/, "") });
    // 记录最近预设
    if (presetId && settings) {
      update({ recentPresets: [presetId, ...settings.recentPresets.filter((x) => x !== presetId)].slice(0, 5) });
    }
  };

  return (
    <DropZone onFiles={([path]) => path && void pickInput(path)} accept="video" className="h-full">
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold">{t("video.title")}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">{t("video.desc")}</p>
            </div>
            {/* 预设快速调用 */}
            <div className="flex items-center gap-2">
              <Select value={presetId} onValueChange={(v) => v !== null && applyPreset(v)}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t("video.presetNone")}</SelectItem>
                  {videoPresets.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={savePreset} title={t("video.savePreset")}>
                <Save className="size-4" />
              </Button>
            </div>
          </div>

        {/* 输入 / 格式 / 输出 */}
        <Card>
          <CardContent className="space-y-4 pt-6">
            <FileRow
              label={t("video.input")}
              value={input}
              onBrowse={() => void pickInput()}
              readOnly
              onChange={(v) => setInput(v)}
            />
            {probing && <p className="text-xs text-muted-foreground">{t("video.loadingInfo")}</p>}
            {media?.ok && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{formatMs(media.durationMs)}</Badge>
                {media.streams
                  .filter((s) => s.codecType === "video")
                  .map((s, i) => (
                    <Badge key={i} variant="outline">
                      {s.width}×{s.height} {s.codecName}
                    </Badge>
                  ))}
                {media.streams
                  .filter((s) => s.codecType === "audio")
                  .map((s, i) => (
                    <Badge key={i} variant="outline">
                      {s.codecName} {s.sampleRate ? `${s.sampleRate}Hz` : ""}
                    </Badge>
                  ))}
              </div>
            )}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <div className="text-sm font-medium leading-none">
                  <Label>{t("video.format")}</Label>
                </div>
                <Select value={format} onValueChange={(v) => v !== null && applyFormat(v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VIDEO_FORMATS.map((f) => (
                      <SelectItem key={f.ext} value={f.ext}>{t(f.label)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <FileRow
                  label={t("video.outputPath")}
                  value={output}
                  onBrowse={() => void pickOutput()}
                  onChange={(v) => setOutput(v)}
                />
              </div>
            </div>
            {format === "mp4" && (
              <p className="text-xs text-muted-foreground">{t("fmt.noteH264Nvenc")}</p>
            )}
          </CardContent>
        </Card>

        {/* 视频 + 音频参数 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              {t("video.sectionVideo")}
              {copyDisabled && <Badge variant="secondary">{t("codec.copy")}</Badge>}
            </CardTitle>
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

        {/* 滤镜 */}
        <Card className={cn(copyDisabled && "opacity-60")}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              {t("video.sectionFilters")}
              {copyDisabled && (
                <Badge variant="destructive" className="text-[10px]">
                  {t("codec.copyHint")}
                </Badge>
              )}
            </CardTitle>
            <CardDescription />
          </CardHeader>
          <CardContent>
            <FilterSection video={video} inputPath={input} onChange={setVideo} />
          </CardContent>
        </Card>

        {/* 命令预览 + 操作 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("video.preview")}</CardTitle>
            <CardDescription>{t("video.previewHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {preview ? (
              <div className="max-h-40 overflow-y-auto rounded-md bg-muted/60 p-3 font-mono text-xs leading-5">
                {preview.map((a, i) => (
                  <span key={i} className="whitespace-pre-wrap break-all">
                    {a}
                    {i < preview.length - 1 ? " " : ""}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("video.previewHint")}</p>
            )}
            <div className="flex items-center gap-2">
              <Button onClick={start} disabled={!input || !output}>
                <Play className="size-4" />
                {t("video.start")}
              </Button>
              <Button
                variant="outline"
                disabled={!preview}
                onClick={() => {
                  void navigator.clipboard.writeText(preview!.join(" "));
                  toast.success(t("common.done"));
                }}
              >
                <Copy className="size-4" />
                {t("video.copyCmd")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </DropZone>
  );
}

/** 简单路径拼接（避免依赖 node path） */
function joinPath(dir: string, name: string): string {
  return dir.endsWith("\\") || dir.endsWith("/") ? dir + name : dir + "\\" + name;
}