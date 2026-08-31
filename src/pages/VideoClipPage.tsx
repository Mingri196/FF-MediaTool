import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Plus, Save, Trash2, ScanSearch, FolderOpen, Film } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useSettings } from "@/settings/SettingsProvider";
import { useTasks } from "@/tasks/TaskProvider";
import { api } from "@/lib/tauri";
import { buildVideoArgs, fmtSec, parseTimeToSec, buildMultiConcatArgs, resolveConcatTarget, type ClipRange } from "@/video/builder";
import { defaultVideoAudioParams, defaultVideoParams, type VideoAudioParams, type VideoParams } from "@/video/types";
import { TimelineRange } from "@/components/video/TimelineRange";
import { VideoEncodeSection } from "@/components/video/VideoEncodeSection";
import { DropZone } from "@/components/shared/DropZone";
import { FileRow } from "@/components/shared/FileRow";
import { CommandPreviewCard } from "@/components/shared/CommandPreviewCard";
import { useCommandPreview } from "@/components/shared/useCommandPreview";
import { basename, deriveOutputPath } from "@/lib/format";
import { useRegisterPageSnapshot, useTabId, useTabInitialState } from "@/tabs/TabManager";
import type { EncoderPreset } from "@/types";

type ClipMode = "trim" | "concat";

/** 复制标签时复刻的视频剪辑页状态快照（concat 的选中索引转数组便于序列化） */
interface VideoClipSnapshot {
  input: string;
  durationSec: number;
  mode: ClipMode;
  segments: Segment[];
  activeIdx: number;
  output: string;
  video: VideoParams;
  audio: VideoAudioParams;
  presetId: string;
  concatFiles: ConcatFile[];
  concatSelected: number[];
  concatSegs: ConcatSeg[];
}

/** 时间裁剪段（trim 模式） */
interface Segment {
  id: string;
  startSec: number;
  endSec: number; // -1 = 到结尾
}

/** 多片段拼接：文件列表条目 */
interface ConcatFile {
  path: string;
  name: string;
  durationSec: number; // -1 = 探测失败
  hasAudio: boolean;
  width: number | null;
  height: number | null;
}

/** 多片段拼接：片段条目（选中文件 + 起止时间原文，解析失败 = 非法） */
interface ConcatSeg {
  id: string;
  filePath: string; // 关联文件列表中的 path
  startRaw: string;
  endRaw: string;
}

/** 视频文件后缀（添加文件夹/拖拽时过滤） */
const CONCAT_VIDEO_EXTS = ["mp4", "mkv", "mov", "webm", "avi", "flv", "m4v", "ts", "wmv", "m2ts", "3gp", "mts", "mpeg", "mpg"];

/** 解析片段时间；返回 null = 非法/空 */
function parseSegTime(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  return parseTimeToSec(s);
}

/** 视频剪辑页（PRD 3.2）：时间裁剪 + 多片段拼接 + 画面处理（旋转/翻转/裁剪） */
export function VideoClipPage() {
  const { t } = useI18n();
  const { settings, update } = useSettings();
  const { guardAddTask } = useTasks();
  const tabId = useTabId();

  const init = useTabInitialState<VideoClipSnapshot>();
  const [input, setInput] = useState(init?.input ?? "");
  const [durationSec, setDurationSec] = useState(init?.durationSec ?? 0);
  const [mode, setMode] = useState<ClipMode>(init?.mode ?? "trim");
  const [segments, setSegments] = useState<Segment[]>(init?.segments ?? [
    { id: crypto.randomUUID(), startSec: 0, endSec: -1 },
  ]);
  const [activeIdx, setActiveIdx] = useState(init?.activeIdx ?? 0);
  const [output, setOutput] = useState(init?.output ?? "");
  const [video, setVideo] = useState<VideoParams>(init?.video ?? defaultVideoParams());
  const [audio, setAudio] = useState(init?.audio ?? defaultVideoAudioParams());
  const [presetId, setPresetId] = useState(init?.presetId ?? "");
  // ---- 多片段拼接（concat）专用状态 ----
  const [concatFiles, setConcatFiles] = useState<ConcatFile[]>(init?.concatFiles ?? []);
  const [concatSelected, setConcatSelected] = useState<Set<number>>(init?.concatSelected ? new Set(init.concatSelected) : new Set());
  const [concatSegs, setConcatSegs] = useState<ConcatSeg[]>(init?.concatSegs ?? []);

  // 复制标签：聚合最新状态供 TabManager 深拷贝注入新标签
  const snapRef = useRef<VideoClipSnapshot>({ input, durationSec, mode, segments, activeIdx, output, video, audio, presetId, concatFiles, concatSelected: [...concatSelected], concatSegs });
  snapRef.current = { input, durationSec, mode, segments, activeIdx, output, video, audio, presetId, concatFiles, concatSelected: [...concatSelected], concatSegs };
  useRegisterPageSnapshot("video-clip", () => snapRef.current);

  const pickInput = useCallback(async (path?: string) => {
    const picked = path ?? await open({
      multiple: false,
      directory: false,
      title: t("clip.input"),
    });
    if (typeof picked !== "string" || !picked) return;
    setInput(picked);
    // 使用默认输出路径，不跟随输入目录；空路径回落 opt
    const cfgDir = settings?.outputPaths?.videoClip;
    const defaultDir = cfgDir || (await api.getOptDir());
    const baseInput = defaultDir + "/" + basename(picked);
    setOutput(deriveOutputPath(baseInput, "mp4"));
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

  // ---------- 多片段拼接：文件列表 & 片段操作 ----------
  const probeConcatFile = useCallback(async (path: string): Promise<ConcatFile> => {
    const name = path.split(/[\\/]/).pop() ?? path;
    try {
      const info = await api.mediaProbeBasic(path);
      const vStream = info.streams.find((s) => s.codecType === "video");
      return {
        path,
        name,
        durationSec: info.durationMs > 0 ? info.durationMs / 1000 : -1,
        hasAudio: info.hasAudio,
        width: vStream?.width ?? null,
        height: vStream?.height ?? null,
      };
    } catch {
      return { path, name, durationSec: -1, hasAudio: false, width: null, height: null };
    }
  }, []);

  const addConcatFiles = useCallback(async (paths?: string[]) => {
    if (!paths) {
      const picked = await open({
        multiple: true,
        filters: [{ name: "Videos", extensions: CONCAT_VIDEO_EXTS }],
        title: t("clip.concatAddFiles"),
      });
      if (typeof picked === "string") paths = [picked];
      else if (Array.isArray(picked)) paths = picked;
      else return;
    }
    const existing = new Set(concatFiles.map((f) => f.path));
    const fresh = paths.filter(
      (p) => CONCAT_VIDEO_EXTS.includes(p.split(".").pop()?.toLowerCase() ?? "") && !existing.has(p),
    );
    if (fresh.length === 0) return;
    const probed = await Promise.all(fresh.map((p) => probeConcatFile(p)));
    setConcatFiles((prev) => [...prev, ...probed]);
  }, [concatFiles, probeConcatFile, t]);

  const addConcatFolder = useCallback(async () => {
    const dir = await open({ directory: true, multiple: false, title: t("img.addFolder") });
    if (!dir || typeof dir !== "string") return;
    try {
      const videos = await api.scanDirectory(dir, CONCAT_VIDEO_EXTS);
      await addConcatFiles(videos);
    } catch {
      toast.error(t("img.folderEmpty"));
    }
  }, [addConcatFiles, t]);

  const concatAllSelected = concatFiles.length > 0 && concatSelected.size === concatFiles.length;
  const toggleConcatAll = () => {
    if (concatAllSelected) setConcatSelected(new Set());
    else setConcatSelected(new Set(concatFiles.map((_, i) => i)));
  };
  const toggleConcatSelect = (idx: number) => {
    setConcatSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };
  const removeConcatSelected = () => {
    const keep = concatFiles.filter((_, i) => !concatSelected.has(i));
    setConcatFiles(keep);
    setConcatSelected(new Set());
    // 同步移除引用了被删文件的片段
    const removed = new Set(concatFiles.filter((_, i) => concatSelected.has(i)).map((f) => f.path));
    if (removed.size > 0) {
      setConcatSegs((prev) => prev.filter((s) => !removed.has(s.filePath)));
    }
  };
  const clearConcatFiles = () => {
    setConcatFiles([]);
    setConcatSelected(new Set());
    setConcatSegs([]);
  };

  const addConcatSeg = () => {
    setConcatSegs((prev) => [...prev, { id: crypto.randomUUID(), filePath: "", startRaw: "", endRaw: "" }]);
  };
  const removeConcatSeg = (id: string) => {
    setConcatSegs((prev) => prev.filter((s) => s.id !== id));
  };
  const moveConcatSeg = (idx: number, dir: -1 | 1) => {
    setConcatSegs((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  const concatFileByPath = useCallback(
    (path: string) => concatFiles.find((f) => f.path === path),
    [concatFiles],
  );

  /** 片段时间校验：返回错误信息或 null */
  const validateSeg = useCallback(
    (seg: ConcatSeg): string | null => {
      if (!seg.filePath) return t("clip.concatSegNoFile");
      const file = concatFileByPath(seg.filePath);
      if (!file) return t("clip.concatSegNoFile");
      if (file.durationSec < 0) return t("clip.concatSegBadFile");
      const start = parseSegTime(seg.startRaw);
      const end = parseSegTime(seg.endRaw);
      if (start === null || end === null) return t("clip.concatTimeEmpty");
      if (end <= start) return t("clip.concatEndGtStart");
      if (start > file.durationSec || end > file.durationSec) return t("clip.concatTimeExceed");
      return null;
    },
    [concatFileByPath, t],
  );

  /** 可运行前置：文件≥1、片段≥2、全部片段合法 */
  const concatCanStart =
    concatFiles.length >= 1 && concatSegs.length >= 2 && concatSegs.every((s) => validateSeg(s) === null);

  const updateActive = (patch: Partial<Segment>) => {
    setSegments((prev) =>
      prev.map((s, i) => (i === activeIdx ? { ...s, ...patch } : s)),
    );
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

  /** concat 模式：全部合法片段的构建输入（按片段顺序） */
  const concatInputs = useMemo(() => {
    if (mode !== "concat") return null;
    if (!concatCanStart) return null;
    return concatSegs.map((seg) => {
      const file = concatFileByPath(seg.filePath)!;
      return {
        path: file.path,
        startSec: parseSegTime(seg.startRaw)!,
        endSec: parseSegTime(seg.endRaw)!,
        hasAudio: file.hasAudio,
      };
    });
  }, [mode, concatSegs, concatFileByPath, concatCanStart]);

  /** concat 统一目标参数：以第一段文件的分辨率为基准（用户缩放设置优先） */
  const concatTarget = useMemo(() => {
    if (mode !== "concat" || concatInputs === null) return null;
    const first = concatFileByPath(concatSegs[0]?.filePath ?? "");
    return resolveConcatTarget(
      { width: first?.width ?? null, height: first?.height ?? null },
      video,
      audio,
    );
  }, [mode, concatInputs, concatSegs, concatFileByPath, video, audio]);

  const autoArgs = useMemo(() => {
    if (mode === "concat") {
      if (concatInputs === null || concatTarget === null || !output) return null;
      try {
        return buildMultiConcatArgs(concatInputs, output, video, audio, concatTarget);
      } catch (e) {
        console.error(e);
        return null;
      }
    }
    if (!input || !output) return null;
    try {
      return buildVideoArgs({ input, output, video, audio, clip: trimRange, concat: clipSegments });
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [mode, input, output, video, audio, trimRange, clipSegments, concatInputs, concatTarget]);

  const cmdPreview = useCommandPreview(autoArgs);

  const canStart =
    mode === "concat"
      ? concatCanStart && !!output
      : !!autoArgs && !!input && !!output && segments.length >= 1;

  // ---- 预设 ----
  const clipPresets = useMemo(
    () => (settings?.presets ?? []).filter((p) => p.category === "clip"),
    [settings?.presets],
  );

  /** 应用剪辑预设：回填视频/音频编码参数与剪辑模式；空 id =（默认参数）重置 */
  const applyPreset = (id: string) => {
    setPresetId(id);
    const p = clipPresets.find((x) => x.id === id);
    if (!p) {
      // （默认参数）：恢复出厂默认
      setVideo(defaultVideoParams());
      setAudio(defaultVideoAudioParams());
      setMode("trim");
      return;
    }
    const saved = p.params as {
      video?: Partial<VideoParams>;
      audio?: ReturnType<typeof defaultVideoAudioParams>;
      mode?: ClipMode;
    };
    setVideo({ ...defaultVideoParams(), ...(saved.video ?? {}) } as VideoParams);
    setAudio({ ...defaultVideoAudioParams(), ...(saved.audio ?? {}) } as ReturnType<typeof defaultVideoAudioParams>);
    if (saved.mode === "trim" || saved.mode === "concat") setMode(saved.mode);
  };

  /** 保存当前剪辑参数为预设（标记 category=clip） */
  const savePreset = () => {
    const name = window.prompt(t("clip.savePresetName"), "My Preset");
    if (!name?.trim()) return;
    const now = Date.now();
    const preset: EncoderPreset = {
      id: crypto.randomUUID(),
      name: name.trim(),
      category: "clip",
      createdAt: now,
      updatedAt: now,
      params: { video, audio, mode } as unknown as Record<string, unknown>,
    };
    update({ presets: [...(settings?.presets ?? []), preset] });
    toast.success(t("clip.presetSaved"));
  };

  const start = () => {
    if (!output || !canStart) return;
    if (mode === "concat") {
      if (concatInputs === null || concatTarget === null) return;
      void guardAddTask({
        name: `${t("clip.mode.concat")} (${concatSegs.length} 段) → ${basename(output)}`,
        args: cmdPreview.getArgs(),
        inputPath: concatInputs[0].path,
        outputPath: output,
      }, tabId);
      return;
    }
    if (!input) return;
    void guardAddTask({
      name: `${basename(input)} → ${basename(output)}`,
      args: cmdPreview.getArgs(),
      inputPath: input,
      outputPath: output,
    }, tabId);
  };

  const copyCmd = () => {
    void navigator.clipboard.writeText(cmdPreview.text);
    toast.success(t("common.done"));
  };

  /** concat 模式：隐藏顶部输入框时依旧需要输出目录同步（输出路径体系不变） */
  useEffect(() => {
    if (mode !== "concat") return;
    (async () => {
      const cfgDir = settings?.outputPaths?.videoClip;
      const defaultDir = cfgDir || (await api.getOptDir());
      setOutput((prev) => prev || `${defaultDir}/${t("clip.concatOutName")}.mp4`);
    })();
  }, [mode, settings?.outputPaths?.videoClip, t]);

  /** concat 模式：片段下拉选中文件时自动带出文件名前缀作为输出名基准（首次赋值） */
  const pickConcatSegFile = (id: string, filePath: string) => {
    setConcatSegs((prev) => prev.map((s) => (s.id === id ? { ...s, filePath } : s)));
  };

  const cycleToNext = () => {
    const next = (activeIdx + 1) % segments.length;
    setActiveIdx(next);
  };

  return (
    <DropZone
      onFiles={(paths) => {
        // 多片段拼接模式：拖入多个视频 → 加入文件列表；时间裁剪：单输入
        if (mode === "concat") void addConcatFiles(paths);
        else void pickInput(paths[0]);
      }}
      accept="video"
      className="h-full"
    >
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">{t("clip.title")}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("clip.desc")}</p>
          </div>
          {/* 预设快速调用（与视频转换页一致） */}
          <div className="flex items-center gap-2">
            <Select value={presetId} onValueChange={(v) => v !== null && applyPreset(v)}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder={t("clip.presetNone")}>
                  {(val) => {
                    const p = clipPresets.find((x) => x.id === val);
                    return p ? p.name : t("clip.presetNone");
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t("clip.presetNone")}</SelectItem>
                {clipPresets.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={savePreset} title={t("clip.savePreset")}>
              <Save className="size-4" />
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="space-y-4 pt-6">
            {/* 模式选择（位于输入文件上方） */}
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
              {mode === "trim" && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {t("clip.duration")}: {durationSec > 0 ? fmtSec(durationSec) : "—"}
                </span>
              )}
            </div>

            {/* 时间裁剪：顶部输入文件框（多片段拼接隐藏） */}
            {mode === "trim" && (
              <FileRow label={t("clip.input")} value={input} onBrowse={() => void pickInput()} readOnly />
            )}

            {/* 多片段拼接：文件列表（参考图片转换） + 片段列表 */}
            {mode === "concat" && (
              <>
                {/* 文件列表 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox checked={concatAllSelected} onCheckedChange={toggleConcatAll} />
                    <Label className="text-sm font-medium">
                      {t("clip.concatFileList")}（{t("clip.concatFileCount", { count: concatFiles.length })}）
                    </Label>
                    <span className="ml-auto flex items-center gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => void addConcatFolder()}>
                        <FolderOpen className="size-4" />{t("img.addFolder")}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void addConcatFiles()}>
                        <Film className="size-4" />{t("img.addFiles")}
                      </Button>
                      {concatSelected.size > 0 && (
                        <Button variant="ghost" size="sm" onClick={removeConcatSelected}>
                          <Trash2 className="size-4" />{t("img.removeSelected")}
                        </Button>
                      )}
                      {concatFiles.length > 0 && (
                        <Button variant="ghost" size="sm" onClick={clearConcatFiles}>
                          <Trash2 className="size-4" />{t("img.clearAll")}
                        </Button>
                      )}
                    </span>
                  </div>
                  {concatFiles.length === 0 && (
                    <div className="flex h-16 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                      {t("clip.concatNoFiles")}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {concatFiles.map((f, i) => (
                      <div key={f.path} className="flex items-center gap-3 rounded-md bg-muted/30 px-3 py-1.5 text-sm">
                        <Checkbox checked={concatSelected.has(i)} onCheckedChange={() => toggleConcatSelect(i)} />
                        <span className="min-w-0 flex-1 truncate font-mono text-xs">{f.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {f.durationSec >= 0 ? fmtSec(f.durationSec) : t("clip.concatProbeFail")}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 text-muted-foreground"
                          onClick={() => {
                            setConcatFiles((prev) => prev.filter((_, j) => j !== i));
                            setConcatSelected((prev) => { const n = new Set(prev); n.delete(i); return n; });
                          }}
                          title={t("img.remove")}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{t("clip.concatFileHint")}</p>
                </div>

                {/* 片段列表 */}
                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium">{t("clip.concatSegList")}</Label>
                    <Button variant="outline" size="sm" onClick={addConcatSeg}>
                      <Plus className="size-3.5" />{t("clip.addSegment")}
                    </Button>
                  </div>
                  {concatSegs.length === 0 && (
                    <div className="flex h-12 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
                      {t("clip.concatSegEmpty")}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {concatSegs.map((seg, idx) => {
                      const file = concatFileByPath(seg.filePath);
                      const err = validateSeg(seg);
                      return (
                        <div key={seg.id} className={cn("flex items-center gap-2 rounded-md border px-2 py-1.5", err && "border-destructive/50")}>
                          {/* 序号 + 上移/下移 */}
                          <div className="flex flex-col items-center">
                            <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => moveConcatSeg(idx, -1)} disabled={idx === 0} title={t("clip.moveUp")}>▲</button>
                            <span className="w-4 text-center text-xs tabular-nums">{idx + 1}</span>
                            <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => moveConcatSeg(idx, 1)} disabled={idx === concatSegs.length - 1} title={t("clip.moveDown")}>▼</button>
                          </div>
                          {/* 文件下拉 */}
                          <Select
                            value={seg.filePath}
                            onValueChange={(v) => v !== null && pickConcatSegFile(seg.id, v)}
                          >
                            <SelectTrigger className="w-56">
                              <SelectValue placeholder={t("clip.concatSegChoose")} />
                            </SelectTrigger>
                            <SelectContent>
                              {concatFiles.map((f) => (
                                <SelectItem key={f.path} value={f.path} disabled={f.durationSec < 0}>
                                  {f.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {file && file.durationSec >= 0 ? `${t("clip.duration")}: ${fmtSec(file.durationSec)}` : "—"}
                          </span>
                          {/* 起止时间 */}
                          <div className="flex min-w-0 flex-1 items-center gap-1.5">
                            <Input
                              className="h-8 w-24 font-mono text-xs"
                              placeholder={t("clip.start")}
                              value={seg.startRaw}
                              onChange={(e) => setConcatSegs((prev) => prev.map((s) => s.id === seg.id ? { ...s, startRaw: e.target.value } : s))}
                            />
                            <span className="text-muted-foreground">→</span>
                            <Input
                              className="h-8 w-24 font-mono text-xs"
                              placeholder={t("clip.end")}
                              value={seg.endRaw}
                              onChange={(e) => setConcatSegs((prev) => prev.map((s) => s.id === seg.id ? { ...s, endRaw: e.target.value } : s))}
                            />
                          </div>
                          {err && <span className="shrink-0 text-xs text-destructive">{err}</span>}
                          <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => removeConcatSeg(seg.id)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                  <p className="whitespace-pre-wrap text-xs text-muted-foreground">{t("clip.concatSegHint")}</p>
                </div>
              </>
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
            <div className="space-y-1.5">
              <Label>{t("clip.output")}</Label>
              <Input type="text" value={output} onChange={(e) => setOutput(e.target.value)} placeholder="opt" />
            </div>
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

        {/* 命令预览 + 提交（可编辑 textarea） */}
        <CommandPreviewCard
          value={cmdPreview.text}
          onEdit={cmdPreview.setText}
          startLabelKey="clip.generate"
          onStart={start}
          startDisabled={!canStart}
          onCopy={copyCmd}
          copyDisabled={!autoArgs}
          overwriteOpen={cmdPreview.overwriteOpen}
          overwriteText={cmdPreview.pendingText}
          onConfirmOverwrite={cmdPreview.confirmOverwrite}
          onCancelOverwrite={cmdPreview.cancelOverwrite}
          empty={!autoArgs}
        />
        {mode === "trim" && segments.length > 1 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={cycleToNext}>{t("clip.cycleNext")}</Button>
          </div>
        )}
      </div>
      </div>
    </DropZone>
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