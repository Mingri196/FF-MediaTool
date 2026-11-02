import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Archive, ArrowLeft, Camera, Film } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
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
import { useI18n, type I18nKey } from "@/i18n";
import { useTasks } from "@/tasks/TaskProvider";
import { useTabId } from "@/tabs/TabManager";
import { api } from "@/lib/tauri";
import { basename, formatMs } from "@/lib/format";
import { DropZone } from "@/components/shared/DropZone";
import { CommandPreviewCard } from "@/components/shared/CommandPreviewCard";
import { normalizeUserArgs } from "@/components/shared/useCommandPreview";
import {
  buildPass1Args,
  buildPass2Args,
  calcVideoBitrateKbps,
  type TargetEncoder,
} from "@/tools/targetCompress";
import {
  buildScreenshotArgs,
  parseTimePoint,
  screenshotOutName,
  type ScreenshotFormat,
} from "@/tools/screenshot";

/**
 * 独立工具页。
 * 「目标压缩」：输入目标体积 → 自动算码率 → 两遍编码（2-pass）精准贴近目标。
 * 「视频截图」：时间轴点选时间点 → 每点导出一张高清截图。
 * - 两遍编码实现为队列中的两个任务（队列串行执行，第 1 遍输出到 null 混流器）
 * - 输出自动归档：opt 目录下按输入文件名建立专属子目录
 * - 命令预览与四模块一致（可编辑，编辑后以用户命令为准）
 */
export function ToolsPage() {
  const { t } = useI18n();
  const [currentTool, setCurrentTool] = useState<"target-compress" | "screenshot" | null>(null);

  if (!currentTool) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-5 p-6">
          <div>
            <h1 className="text-xl font-semibold">{t("tools.title")}</h1>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ToolCard
              icon={<Archive className="size-5" />}
              title={t("tools.targetCompress.name")}
              desc={t("tools.targetCompress.desc")}
              onClick={() => setCurrentTool("target-compress")}
              testId="tool-card-target-compress"
            />
            <ToolCard
              icon={<Camera className="size-5" />}
              title={t("tools.screenshot.name")}
              desc={t("tools.screenshot.desc")}
              onClick={() => setCurrentTool("screenshot")}
              testId="tool-card-screenshot"
            />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-5 p-6">
        <Button type="button" variant="outline" size="sm" onClick={() => setCurrentTool(null)}>
          <ArrowLeft className="size-4" />
          {t("tools.back")}
        </Button>
        {currentTool === "target-compress" ? <TargetCompressTool /> : <ScreenshotTool />}
      </div>
    </div>
  );
}

function ToolCard({ icon, title, desc, onClick, testId }: {
  icon: ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="group rounded-xl border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
    >
      <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{desc}</p>
      <div className="mt-3 text-xs font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
        {title} →
      </div>
    </button>
  );
}

/* ================= 目标压缩 ================= */

type AudioMode = "keep" | "compress" | "remove";
/** 分辨率限制："keep" = 原分辨率；数字 = 限制最大高度（px） */
type ResMode = "keep" | "1080" | "720" | "480";

const AUDIO_LABEL: Record<AudioMode, I18nKey> = {
  keep: "tools.audio.keep",
  compress: "tools.audio.compress",
  remove: "tools.audio.remove",
};

const RES_LABEL: Record<ResMode, I18nKey> = {
  keep: "tools.res.keep",
  "1080": "tools.res.1080",
  "720": "tools.res.720",
  "480": "tools.res.480",
};

const FMT_LABEL: Record<ScreenshotFormat, string> = { jpg: "JPG", png: "PNG", webp: "WebP" };
const Q_LABEL: Record<string, I18nKey> = {
  "2": "tools.screenshot.qHigh",
  "4": "tools.screenshot.qStd",
  "8": "tools.screenshot.qLow",
};

function TargetCompressTool() {
  const { t } = useI18n();
  const { guardAddTask } = useTasks();
  const tabId = useTabId();

  const [input, setInput] = useState("");
  const [durationMs, setDurationMs] = useState(0);
  const [targetMB, setTargetMB] = useState(100);
  const [audioMode, setAudioMode] = useState<AudioMode>("keep");
  const [encoder, setEncoder] = useState<TargetEncoder>("x264");
  const [resMode, setResMode] = useState<ResMode>("keep");
  const [sourceHeight, setSourceHeight] = useState(0);
  const [probing, setProbing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [optDir, setOptDir] = useState("");
  // 命令预览（两条命令，各占一行；用户编辑后以用户命令为准）
  const [cmdText, setCmdText] = useState("");
  const [cmdDirty, setCmdDirty] = useState(false);

  useEffect(() => {
    void api.getOptDir().then(setOptDir).catch((e) => console.error(e));
  }, []);

  const pickInput = useCallback(async (path?: string) => {
    let picked = path ?? "";
    if (!picked) {
      const r = await open({
        multiple: false,
        directory: false,
        title: t("tools.title"),
        filters: [
          { name: "Media", extensions: ["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "ts", "m4v", "mpg", "mpeg", "3gp", "mts", "m2ts", "vob"] },
          { name: "All", extensions: ["*"] },
        ],
      });
      if (typeof r !== "string" || !r) return;
      picked = r;
    }
    setInput(picked);
    setCmdDirty(false);
    setDurationMs(0);
    setProbing(true);
    try {
      const info = await api.mediaProbeBasic(picked);
      setDurationMs(info.ok ? info.durationMs : 0);
      setSourceHeight(info.ok ? (info.streams.find((s) => s.codecType === "video")?.height ?? 0) : 0);
      if (!info.ok || info.durationMs <= 0) {
        toast.error(t("tools.needDuration"));
      }
    } catch (e) {
      console.error(e);
      toast.error(t("tools.needDuration"));
    } finally {
      setProbing(false);
    }
  }, [t]);

  const audioKbps = audioMode === "keep" ? 128 : audioMode === "compress" ? 96 : 0;
  const videoKbps = useMemo(
    () => calcVideoBitrateKbps({ targetMB, durationSec: durationMs / 1000, audioKbps }),
    [targetMB, durationMs, audioKbps],
  );

  /** 输出归档目录：opt/<输入文件名（不含扩展名）>/ ；输出文件 = 原名.新后缀（约定） */
  const outDir = useMemo(() => {
    if (!input || !optDir) return null;
    const folder = basename(input).replace(/\.[^.]+$/, "");
    return `${optDir.replace(/[\\/]+$/, "")}\\${folder}`;
  }, [input, optDir]);

  const outputPath = useMemo(
    () => (outDir && input ? `${outDir}\\${basename(input).replace(/\.[^.]+$/, "")}.mp4` : null),
    [outDir, input],
  );

  /** 分辨率限制：仅当源视频实际高于所选值时才降采样，否则保持原样（避免放大） */
  const maxHeight = useMemo(() => {
    if (resMode === "keep") return null;
    const limit = Number(resMode);
    return sourceHeight > limit ? limit : null;
  }, [resMode, sourceHeight]);

  const autoPass1Args = useMemo(
    () => (input && outputPath && videoKbps && videoKbps > 0
      ? buildPass1Args({ input, output: outputPath, videoKbps, audioKbps, passlogPath: `${outputPath}.passlog`, encoder, maxHeight })
      : null),
    [input, outputPath, videoKbps, audioKbps, encoder, maxHeight],
  );
  const autoPass2Args = useMemo(
    () => (input && outputPath && videoKbps && videoKbps > 0
      ? buildPass2Args({ input, output: outputPath, videoKbps, audioKbps, passlogPath: `${outputPath}.passlog`, encoder, maxHeight })
      : null),
    [input, outputPath, videoKbps, audioKbps, encoder, maxHeight],
  );

  const autoCmd = useMemo(
    () => (autoPass1Args && autoPass2Args
      ? `ffmpeg ${autoPass1Args.join(" ")}\nffmpeg ${autoPass2Args.join(" ")}`
      : ""),
    [autoPass1Args, autoPass2Args],
  );

  // 未编辑时自动命令变化 → 同步刷新文本
  useEffect(() => {
    if (autoCmd && !cmdDirty) setCmdText(autoCmd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCmd]);

  const start = useCallback(async () => {
    if (!input) {
      toast.error(t("tools.needFile"));
      return;
    }
    if (!videoKbps || videoKbps <= 0) {
      toast.error(t("tools.needDuration"));
      return;
    }
    if (!outDir || !outputPath) return;
    setAdding(true);
    try {
      await api.ensureDir(outDir);
      // 未编辑 → 直接用参数数组（避免任何转义/分词损耗）；编辑过 → 逐行解析用户命令
      const cmds: string[][] = cmdDirty
        ? cmdText
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean)
            .map(normalizeUserArgs)
            .filter((a) => a.length > 0)
        : [autoPass1Args, autoPass2Args].filter((a): a is string[] => a !== null);
      const displayName = `${basename(input)} → ${basename(outputPath)}`;
      if (cmds.length >= 2) {
        // 第 1 遍不落实际文件，outputPath 置空避免输出冲突检查误报
        await guardAddTask({
          name: `${displayName}${t("tools.pass1Suffix")}`,
          args: cmds[0],
          inputPath: input,
          outputPath: "",
        }, tabId);
        await guardAddTask({
          name: `${displayName}${t("tools.pass2Suffix")}`,
          args: cmds[1],
          inputPath: input,
          outputPath,
        }, tabId);
        toast.success(t("tools.taskAdded"));
      } else if (cmds.length === 1) {
        await guardAddTask({
          name: displayName,
          args: cmds[0],
          inputPath: input,
          outputPath,
        }, tabId);
        toast.success(t("tools.taskAddedSingle"));
      } else {
        toast.error(t("tools.needFile"));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAdding(false);
    }
  }, [input, videoKbps, outDir, outputPath, cmdDirty, cmdText, autoPass1Args, autoPass2Args, guardAddTask, tabId, t]);

  const copyCmd = useCallback(() => {
    void navigator.clipboard.writeText(cmdText);
    toast.success(t("common.done"));
  }, [cmdText, t]);

  return (
    <div className="space-y-5" data-testid="tool-target-compress">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Archive className="size-5 text-primary" />
          {t("tools.targetCompress.name")}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("tools.targetCompress.desc")}</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold">{t("tools.input")}</CardTitle>
        </CardHeader>
        <CardContent>
          <DropZone accept="video" onFiles={(paths) => void pickInput(paths[0])}>
            <button
              type="button"
              data-testid="tc-pick"
              onClick={() => void pickInput()}
              className="w-full rounded-lg border border-dashed border-muted-foreground/40 px-4 py-7 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              {input ? (
                <span className="flex items-center justify-center gap-2">
                  <Film className="size-4" />
                  <span className="font-mono text-xs text-foreground">{basename(input)}</span>
                  <span className="text-xs">（{t("tools.changeFile")}）</span>
                </span>
              ) : (
                t("tools.pickFile")
              )}
            </button>
          </DropZone>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">{t("tools.targetSize")}</Label>
            <Input
              type="number"
              data-testid="tc-target"
              min={1}
              value={targetMB}
              onChange={(e) => setTargetMB(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">{t("tools.audio")}</Label>
            <Select value={audioMode} onValueChange={(v) => v !== null && setAudioMode(v as AudioMode)}>
              <SelectTrigger className="w-full" data-testid="tc-audio">
                <SelectValue>{t(AUDIO_LABEL[audioMode])}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="keep">{t("tools.audio.keep")}</SelectItem>
                <SelectItem value="compress">{t("tools.audio.compress")}</SelectItem>
                <SelectItem value="remove">{t("tools.audio.remove")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">{t("tools.encoder")}</Label>
            <Select value={encoder} onValueChange={(v) => v !== null && setEncoder(v as TargetEncoder)}>
              <SelectTrigger className="w-full" data-testid="tc-encoder">
                <SelectValue>{encoder === "x265" ? t("tools.encoder.x265") : t("tools.encoder.x264")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="x264">{t("tools.encoder.x264")}</SelectItem>
                <SelectItem value="x265">{t("tools.encoder.x265")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">{t("tools.resolution")}</Label>
            <Select value={resMode} onValueChange={(v) => v !== null && setResMode(v as ResMode)}>
              <SelectTrigger className="w-full" data-testid="tc-resolution">
                <SelectValue>{t(RES_LABEL[resMode])}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="keep">{t("tools.res.keep")}</SelectItem>
                <SelectItem value="1080">{t("tools.res.1080")}</SelectItem>
                <SelectItem value="720">{t("tools.res.720")}</SelectItem>
                <SelectItem value="480">{t("tools.res.480")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-full flex flex-wrap gap-x-8 gap-y-1 rounded-lg border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
            <span>{t("tools.calc.duration")} <b className="font-mono text-foreground">{probing ? t("tools.calc.probing") : durationMs > 0 ? formatMs(durationMs) : "—"}</b></span>
            <span>{t("tools.calc.bitrate")} <b className="font-mono text-primary" data-testid="tc-bitrate">{videoKbps ? `${videoKbps.toLocaleString()} kbps` : "—"}</b></span>
            <span>{t("tools.calc.mode")} <b className="text-foreground">{t("tools.calc.twoPass")}</b></span>
            {outDir && (
              <span className="w-full truncate font-mono text-[11px] text-muted-foreground/80">
                {t("tools.calc.output")} {outDir}\
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <CommandPreviewCard
        value={cmdText}
        onEdit={(v) => {
          setCmdText(v);
          setCmdDirty(v !== autoCmd);
        }}
        startLabelKey="tools.addTask"
        onStart={() => void start()}
        startDisabled={!input || !videoKbps || probing || adding}
        onCopy={copyCmd}
        copyDisabled={!cmdText}
        overwriteOpen={false}
        overwriteText=""
        onConfirmOverwrite={() => {}}
        onCancelOverwrite={() => {}}
        empty={!autoCmd}
        emptyText={t("tools.previewEmpty")}
      />
    </div>
  );
}

/* ================= 视频截图 ================= */

type NamingMode = "time" | "seq";

const RES_LIMITS: Array<{ value: string; height: number }> = [
  { value: "2160", height: 2160 },
  { value: "1080", height: 1080 },
  { value: "720", height: 720 },
];

function ScreenshotTool() {
  const { t } = useI18n();
  const { guardAddTask } = useTasks();
  const tabId = useTabId();

  const [input, setInput] = useState("");
  const [durationMs, setDurationMs] = useState(0);
  const [sourceHeight, setSourceHeight] = useState(0);
  const [points, setPoints] = useState<number[]>([]);
  const [timeInput, setTimeInput] = useState("");
  const [format, setFormat] = useState<ScreenshotFormat>("jpg");
  const [quality, setQuality] = useState(4);
  const [scale, setScale] = useState("keep");
  const [naming, setNaming] = useState<NamingMode>("time");
  const [probing, setProbing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [optDir, setOptDir] = useState("");
  const [cmdText, setCmdText] = useState("");
  const [cmdDirty, setCmdDirty] = useState(false);

  useEffect(() => {
    void api.getOptDir().then(setOptDir).catch((e) => console.error(e));
  }, []);

  const pickInput = useCallback(async (path?: string) => {
    let picked = path ?? "";
    if (!picked) {
      const r = await open({
        multiple: false,
        directory: false,
        title: t("tools.title"),
        filters: [
          { name: "Media", extensions: ["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "ts", "m4v", "mpg", "mpeg", "3gp", "mts", "m2ts", "vob"] },
          { name: "All", extensions: ["*"] },
        ],
      });
      if (typeof r !== "string" || !r) return;
      picked = r;
    }
    setInput(picked);
    setCmdDirty(false);
    setDurationMs(0);
    setPoints([]);
    setProbing(true);
    try {
      const info = await api.mediaProbeBasic(picked);
      setDurationMs(info.ok ? info.durationMs : 0);
      setSourceHeight(info.ok ? (info.streams.find((s) => s.codecType === "video")?.height ?? 0) : 0);
      if (!info.ok || info.durationMs <= 0) toast.error(t("tools.needDuration"));
    } catch (e) {
      console.error(e);
      toast.error(t("tools.needDuration"));
    } finally {
      setProbing(false);
    }
  }, [t]);

  const durationSec = durationMs / 1000;
  const maxHeight = useMemo(() => {
    if (scale === "keep") return null;
    const limit = Number(scale);
    return sourceHeight > limit ? limit : null;
  }, [scale, sourceHeight]);

  const sortedPoints = useMemo(() => [...points].sort((a, b) => a - b), [points]);

  const outDir = useMemo(() => {
    if (!input || !optDir) return null;
    const folder = basename(input).replace(/\.[^.]+$/, "");
    return `${optDir.replace(/[\\/]+$/, "")}\\${folder}`;
  }, [input, optDir]);

  const autoCmd = useMemo(() => {
    if (!input || !outDir || sortedPoints.length === 0) return "";
    return sortedPoints
      .map((sec, idx) => {
        const out = `${outDir}\\${screenshotOutName(sec, idx, format, naming)}`;
        return `ffmpeg ${buildScreenshotArgs({ input, output: out, timeSec: sec, format, quality, maxHeight }).join(" ")}`;
      })
      .join("\n");
  }, [input, outDir, sortedPoints, format, naming, quality, maxHeight]);

  useEffect(() => {
    if (autoCmd && !cmdDirty) setCmdText(autoCmd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCmd]);

  /** 点击时间轴添加截图点（避免与已有点重复） */
  const addPointAt = useCallback((fraction: number) => {
    if (!durationSec) return;
    const sec = Math.min(durationSec, Math.max(0, Math.round(fraction * durationSec)));
    setPoints((prev) => {
      if (prev.some((p) => Math.abs(p - sec) < 0.5)) {
        toast.info(t("tools.screenshot.duplicate"));
        return prev;
      }
      return [...prev, sec];
    });
  }, [durationSec, t]);

  const addManualPoint = useCallback(() => {
    const sec = parseTimePoint(timeInput);
    if (sec === null) {
      toast.error(t("tools.screenshot.invalidTime"));
      return;
    }
    if (durationSec && sec > durationSec) {
      toast.error(t("tools.screenshot.outOfRange"));
      return;
    }
    setPoints((prev) => {
      if (prev.some((p) => Math.abs(p - sec) < 0.5)) {
        toast.info(t("tools.screenshot.duplicate"));
        return prev;
      }
      return [...prev, sec];
    });
    setTimeInput("");
  }, [timeInput, durationSec, t]);

  const start = useCallback(async () => {
    if (!input) {
      toast.error(t("tools.needFile"));
      return;
    }
    if (sortedPoints.length === 0) {
      toast.error(t("tools.screenshot.noPoints"));
      return;
    }
    if (!outDir) return;
    setAdding(true);
    try {
      await api.ensureDir(outDir);
      // 未编辑 → 每个时间点一个参数数组；编辑过 → 逐行解析用户命令
      const cmds: Array<{ args: string[]; out: string }> = cmdDirty
        ? cmdText
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean)
            .map(normalizeUserArgs)
            .filter((a) => a.length > 0)
            .map((args) => ({ args, out: args[args.length - 1] ?? "" }))
        : sortedPoints.map((sec, idx) => {
            const out = `${outDir}\\${screenshotOutName(sec, idx, format, naming)}`;
            return {
              args: buildScreenshotArgs({ input, output: out, timeSec: sec, format, quality, maxHeight }),
              out,
            };
          });
      for (const c of cmds) {
        await guardAddTask({
          name: `${basename(input)} → ${c.out.split(/[\\/]/).pop() ?? ""}`,
          args: c.args,
          inputPath: input,
          outputPath: c.out,
        }, tabId);
      }
      toast.success(t("tools.screenshot.added", { count: cmds.length }));
    } catch (e) {
      console.error(e);
    } finally {
      setAdding(false);
    }
  }, [input, sortedPoints, outDir, cmdDirty, cmdText, format, naming, quality, maxHeight, guardAddTask, tabId, t]);

  const copyCmd = useCallback(() => {
    void navigator.clipboard.writeText(cmdText);
    toast.success(t("common.done"));
  }, [cmdText, t]);

  return (
    <div className="space-y-5" data-testid="tool-screenshot">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Camera className="size-5 text-primary" />
          {t("tools.screenshot.name")}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("tools.screenshot.desc")}</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold">{t("tools.input")}</CardTitle>
        </CardHeader>
        <CardContent>
          <DropZone accept="video" onFiles={(paths) => void pickInput(paths[0])}>
            <button
              type="button"
              data-testid="ss-pick"
              onClick={() => void pickInput()}
              className="w-full rounded-lg border border-dashed border-muted-foreground/40 px-4 py-7 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              {input ? (
                <span className="flex items-center justify-center gap-2">
                  <Film className="size-4" />
                  <span className="font-mono text-xs text-foreground">{basename(input)}</span>
                  <span className="text-xs">（{t("tools.changeFile")}）</span>
                </span>
              ) : (
                t("tools.pickFile")
              )}
            </button>
          </DropZone>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold">{t("tools.screenshot.points")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 时间轴：点击任意位置添加截图点 */}
          <div
            data-testid="ss-timeline"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              addPointAt((e.clientX - rect.left) / rect.width);
            }}
            className="relative h-14 cursor-copy rounded-lg border border-border bg-gradient-to-r from-slate-800 via-slate-600 to-slate-900"
          >
            {!input ? (
              <span className="absolute inset-0 flex items-center justify-center text-xs text-slate-300">
                {t("tools.screenshot.timelineIdle")}
              </span>
            ) : (
              sortedPoints.map((sec, idx) => (
                <div
                  key={sec}
                  className="pointer-events-none absolute -top-1 h-[calc(100%+8px)] w-0.5 -translate-x-1/2 bg-primary"
                  style={{ left: `${durationSec ? (sec / durationSec) * 100 : 0}%` }}
                >
                  <span className="absolute left-1 top-0 whitespace-nowrap rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary-foreground shadow">
                    {naming === "seq" ? screenshotOutName(sec, idx, format, naming) : formatMs(sec * 1000)}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="flex gap-2">
            <Input
              className="h-9 flex-1"
              placeholder={t("tools.screenshot.timeInputHint")}
              value={timeInput}
              onChange={(e) => setTimeInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addManualPoint()}
            />
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={addManualPoint}>
              {t("tools.screenshot.addPoint")}
            </Button>
          </div>

          {sortedPoints.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {sortedPoints.map((sec, idx) => (
                <span
                  key={sec}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold tabular-nums text-primary"
                >
                  {naming === "seq" ? screenshotOutName(sec, idx, format, naming) : formatMs(sec * 1000)}
                  <button
                    type="button"
                    className="cursor-pointer opacity-60 hover:opacity-100"
                    onClick={() => setPoints((prev) => prev.filter((p) => p !== sec))}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">{t("tools.screenshot.format")}</Label>
            <Select value={format} onValueChange={(v) => v !== null && setFormat(v as ScreenshotFormat)}>
              <SelectTrigger className="w-full" data-testid="ss-format"><SelectValue>{FMT_LABEL[format]}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="jpg">JPG</SelectItem>
                <SelectItem value="png">PNG</SelectItem>
                <SelectItem value="webp">WebP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">{t("tools.screenshot.quality")}</Label>
            <Select
              value={String(quality)}
              onValueChange={(v) => v !== null && setQuality(Number(v))}
              disabled={format === "png"}
            >
              <SelectTrigger className="w-full" data-testid="ss-quality"><SelectValue>{t(Q_LABEL[String(quality)])}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="2">{t("tools.screenshot.qHigh")}</SelectItem>
                <SelectItem value="4">{t("tools.screenshot.qStd")}</SelectItem>
                <SelectItem value="8">{t("tools.screenshot.qLow")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">{t("tools.resolution")}</Label>
            <Select value={scale} onValueChange={(v) => v !== null && setScale(v)}>
              <SelectTrigger className="w-full" data-testid="ss-scale">
                <SelectValue>{scale === "keep" ? t("tools.res.keep") : t("tools.res.limited", { h: Number(scale) })}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="keep">{t("tools.res.keep")}</SelectItem>
                {RES_LIMITS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{t("tools.res.limited", { h: r.height })}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">{t("tools.screenshot.naming")}</Label>
            <Select value={naming} onValueChange={(v) => v !== null && setNaming(v as NamingMode)}>
              <SelectTrigger className="w-full" data-testid="ss-naming"><SelectValue>{t(naming === "seq" ? "tools.naming.seq" : "tools.naming.time")}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="time">{t("tools.naming.time")}</SelectItem>
                <SelectItem value="seq">{t("tools.naming.seq")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <CommandPreviewCard
        value={cmdText}
        onEdit={(v) => {
          setCmdText(v);
          setCmdDirty(v !== autoCmd);
        }}
        startLabelKey="tools.addTask"
        onStart={() => void start()}
        startDisabled={!input || sortedPoints.length === 0 || probing || adding}
        onCopy={copyCmd}
        copyDisabled={!cmdText}
        overwriteOpen={false}
        overwriteText=""
        onConfirmOverwrite={() => {}}
        onCancelOverwrite={() => {}}
        empty={!autoCmd}
        emptyText={t("tools.screenshot.previewEmpty")}
      />
    </div>
  );
}
