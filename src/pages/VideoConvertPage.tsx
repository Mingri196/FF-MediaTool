import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Save } from "lucide-react";
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
import { defaultVideoAudioParams, defaultVideoParams, type VideoAudioParams, type VideoParams } from "@/video/types";
import { FilterSection } from "@/components/video/FilterSection";
import { VideoEncodeSection } from "@/components/video/VideoEncodeSection";
import { DropZone } from "@/components/shared/DropZone";
import { FileRow } from "@/components/shared/FileRow";
import { CommandPreviewCard } from "@/components/shared/CommandPreviewCard";
import { useCommandPreview } from "@/components/shared/useCommandPreview";
import { Input } from "@/components/ui/input";
import { basename, deriveOutputPath, formatMs } from "@/lib/format";
import { useRegisterPageSnapshot, useTabId, useTabInitialState } from "@/tabs/TabManager";
import type { EncoderPreset, MediaBasicInfo } from "@/types";

/** 复制标签时复刻的视频转换页状态快照 */
interface VideoConvertSnapshot {
  input: string;
  media: MediaBasicInfo | null;
  format: string;
  output: string;
  video: VideoParams;
  audio: VideoAudioParams;
  presetId: string;
}

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
  const tabId = useTabId();

  const init = useTabInitialState<VideoConvertSnapshot>();
  const [input, setInput] = useState(init?.input ?? "");
  const [media, setMedia] = useState<MediaBasicInfo | null>(init?.media ?? null);
  const [probing, setProbing] = useState(false);
  const [format, setFormat] = useState(init?.format ?? "mp4");
  const [output, setOutput] = useState(init?.output ?? "");
  const [video, setVideo] = useState<VideoParams>(init?.video ?? defaultVideoParams());
  const [audio, setAudio] = useState(init?.audio ?? defaultVideoAudioParams());
  const [presetId, setPresetId] = useState(init?.presetId ?? "");

  // 复制标签：聚合最新状态供 TabManager 深拷贝注入新标签
  const snapRef = useRef<VideoConvertSnapshot>({ input, media, format, output, video, audio, presetId });
  snapRef.current = { input, media, format, output, video, audio, presetId };
  useRegisterPageSnapshot("video-convert", () => snapRef.current);

  // ---- 命令预览（自动生成；可手动编辑）----
  const autoArgs = useMemo<string[] | null>(() => {
    if (!input || !output) return null;
    try {
      return buildVideoArgs({ input, output, video, audio });
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [input, output, video, audio]);
  const preview = useCommandPreview(autoArgs);

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
      // 记忆最近输入目录（仅用于快速对话框）
      const dir = picked.replace(/[\\/][^\\/]+$/, "");
      if (dir !== lastOutputDir) {
        window.dispatchEvent(new CustomEvent("ffmt:last-input-dir", { detail: dir }));
      }
      // 自动生成输出（使用默认输出路径，不跟随输入目录；空路径回落 opt）
      const cfgDir = settings?.outputPaths?.videoConvert;
      const defaultDir = cfgDir || (await api.getOptDir());
      const baseInput = joinPath(defaultDir, basename(picked));
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
    async (ext: string) => {
      setFormat(ext);
      if (input) {
        const cfgDir = settings?.outputPaths?.videoConvert || (await api.getOptDir());
        const baseInput = joinPath(cfgDir, basename(input));
        setOutput(deriveOutputPath(baseInput, ext));
      }
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

  // ---- 输出路径（从设置读取默认值） ----
  const defaultOutput = settings?.outputPaths?.videoConvert ?? "";
  useEffect(() => {
    if (defaultOutput && !output) setOutput(defaultOutput);
  }, [defaultOutput]);

  // 完成任务后记忆输出目录
  useEffect(() => {
    if (output) {
      const dir = output.replace(/[\\/][^\\/]+$/, "");
      if (dir && dir !== settings?.lastOutputDir) {
        // 已由任务完成回调保存，此处不再重复保存
      }
    }
  }, [output]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (!p) {
        // （默认参数）：恢复出厂默认
        setVideo(defaultVideoParams());
        setAudio(defaultVideoAudioParams());
        return;
      }
      const params = p.params as Partial<VideoParams> | undefined;
      if (params) {
        setVideo({ ...defaultVideoParams(), ...params });
        if (params.vcodec === "copy") {
          // copy 预设：音频保持默认
          setAudio(defaultVideoAudioParams());
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
    // 优先执行用户手动编辑后的命令（hook 内部处理 dirty）
    const args = preview.getArgs();
    void guardAddTask({
      name: `${basename(input)} → ${basename(output)}`,
      args,
      inputPath: input,
      outputPath: output,
    }, tabId);
    update({ lastOutputDir: output.replace(/[\\/][^\\/]+$/, "") });
    // 记录最近预设
    if (presetId && settings) {
      update({ recentPresets: [presetId, ...settings.recentPresets.filter((x) => x !== presetId)].slice(0, 5) });
    }
  };

  const copyCmd = () => {
    void navigator.clipboard.writeText(preview.text);
    toast.success(t("common.done"));
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
                  <SelectValue placeholder={t("video.presetNone")}>
                    {(val) => {
                      const p = videoPresets.find((x) => x.id === val);
                      return p ? p.name : t("video.presetNone");
                    }}
                  </SelectValue>
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
                <Select
                  value={format}
                  onValueChange={(v) => v !== null && applyFormat(v)}
                  items={Object.fromEntries(VIDEO_FORMATS.map((f) => [f.ext, t(f.label)]))}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VIDEO_FORMATS.map((f) => (
                      <SelectItem key={f.ext} value={f.ext}>{t(f.label)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>{t("video.outputPath")}</Label>
                <Input type="text" value={output} onChange={(e) => setOutput(e.target.value)} placeholder="opt" />
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

        {/* 命令预览 + 操作（可编辑 textarea） */}
        <CommandPreviewCard
          value={preview.text}
          onEdit={preview.setText}
          startLabelKey="video.start"
          onStart={start}
          startDisabled={!input || !output}
          onCopy={copyCmd}
          copyDisabled={!autoArgs}
          overwriteOpen={preview.overwriteOpen}
          overwriteText={preview.pendingText}
          onConfirmOverwrite={preview.confirmOverwrite}
          onCancelOverwrite={preview.cancelOverwrite}
          empty={!autoArgs}
        />
      </div>
      </div>
    </DropZone>
  );
}

/** 简单路径拼接（避免依赖 node path） */
function joinPath(dir: string, name: string): string {
  return dir.endsWith("\\") || dir.endsWith("/") ? dir + name : dir + "\\" + name;
}