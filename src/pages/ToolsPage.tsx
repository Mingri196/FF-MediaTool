import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Archive, ArrowLeft, Film } from "lucide-react";
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
} from "@/tools/targetCompress";

/**
 * 独立工具页。
 * 目前包含「目标压缩」：输入目标体积 → 自动算码率 → 两遍编码（2-pass）精准贴近目标。
 * - 两遍编码实现为队列中的两个任务（队列串行执行，第 1 遍输出到 null 混流器）
 * - 输出自动归档：opt 目录下按输入文件名建立专属子目录
 * - 命令预览与四模块一致（可编辑，编辑后以用户命令为准）
 */
export function ToolsPage() {
  const { t } = useI18n();
  const [currentTool, setCurrentTool] = useState<"target-compress" | null>(null);

  if (!currentTool) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-5 p-6">
          <div>
            <h1 className="text-xl font-semibold">{t("tools.title")}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("tools.desc")}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ToolCard
              icon={<Archive className="size-5" />}
              title={t("tools.targetCompress.name")}
              desc={t("tools.targetCompress.desc")}
              onClick={() => setCurrentTool("target-compress")}
              testId="tool-card-target-compress"
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
        <TargetCompressTool />
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

const AUDIO_LABEL: Record<AudioMode, I18nKey> = {
  keep: "tools.audio.keep",
  compress: "tools.audio.compress",
  remove: "tools.audio.remove",
};

function TargetCompressTool() {
  const { t } = useI18n();
  const { guardAddTask } = useTasks();
  const tabId = useTabId();

  const [input, setInput] = useState("");
  const [durationMs, setDurationMs] = useState(0);
  const [targetMB, setTargetMB] = useState(100);
  const [audioMode, setAudioMode] = useState<AudioMode>("keep");
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

  const autoPass1Args = useMemo(
    () => (input && outputPath && videoKbps && videoKbps > 0
      ? buildPass1Args({ input, output: outputPath, videoKbps, audioKbps, passlogPath: `${outputPath}.passlog` })
      : null),
    [input, outputPath, videoKbps, audioKbps],
  );
  const autoPass2Args = useMemo(
    () => (input && outputPath && videoKbps && videoKbps > 0
      ? buildPass2Args({ input, output: outputPath, videoKbps, audioKbps, passlogPath: `${outputPath}.passlog` })
      : null),
    [input, outputPath, videoKbps, audioKbps],
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
            <p className="text-xs text-muted-foreground/70">{t("tools.targetSizeHint")}</p>
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
