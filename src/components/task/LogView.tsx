import { useCallback, useEffect, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { Trash2, Download, Pause, Play, Maximize2, Minimize2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { api } from "@/lib/tauri";
import { isErrorLine } from "@/lib/ffmpegErrors";
import type { LogEntry } from "@/tasks/types";

const DEFAULT_WIDTH_KEY = "ffmt-log-width";
const DEFAULT_WIDTH = 400;
const MIN_WIDTH = 200;
const MAX_WIDTH_PCT = 0.7;

function loadWidth(): number {
  try {
    const v = localStorage.getItem(DEFAULT_WIDTH_KEY);
    if (v) return Math.max(MIN_WIDTH, Math.min(window.innerWidth * MAX_WIDTH_PCT, Number(v)));
  } catch { /* ignore */ }
  return DEFAULT_WIDTH;
}

export function LogView({
  entries,
  onClear,
  emptyText,
  className,
  expanded: controlledExpanded,
  onExpandedChange,
}: {
  entries: LogEntry[];
  onClear?: () => void;
  emptyText?: string;
  className?: string;
  expanded?: boolean;
  onExpandedChange?: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = controlledExpanded ?? localExpanded;
  const setExpanded = onExpandedChange ?? setLocalExpanded;

  const [paused, setPaused] = useState(false);
  const [logWidth, setLogWidth] = useState(loadWidth);
  const [confirmClear, setConfirmClear] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  // 持久化宽度
  const persistWidth = useCallback((w: number) => {
    try { localStorage.setItem(DEFAULT_WIDTH_KEY, String(w)); } catch { /* ignore */ }
  }, []);

  // 自动滚动
  useEffect(() => {
    if (paused || !scrollRef.current) return;
    const el = scrollRef.current;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (isNearBottom) el.scrollTop = el.scrollHeight;
  }, [entries, paused]);

  // 拖拽调整宽度（右侧边缘）
  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = true;
    startX.current = e.clientX;
    startW.current = logWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = ev.clientX - startX.current;
      const maxW = window.innerWidth * MAX_WIDTH_PCT;
      const next = Math.max(MIN_WIDTH, Math.min(maxW, startW.current + delta));
      setLogWidth(next);
    };
    const onUp = () => {
      dragRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      persistWidth(logWidth);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const handleClear = () => {
    if (onClear) {
      setConfirmClear(true);
    }
  };

  const doClear = () => {
    onClear?.();
    setConfirmClear(false);
  };

  const exportLog = async () => {
    if (entries.length === 0) return;
    const path = await save({
      title: t("taskbar.log.export"),
      filters: [{ name: "Log", extensions: ["txt", "log"] }],
    });
    if (typeof path === "string" && path) {
      try {
        await api.writeTextFile(path, entries.map((e) => e.line).join("\n"));
        toast.success(t("common.done"));
      } catch (e) {
        toast.error(String(e));
      }
    }
  };

  return (
    <div className={cn("flex flex-col relative", className)}>
      {/* 工具栏 —— 按钮始终可见 */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-2 py-1">
        <span className="text-xs font-medium text-muted-foreground">
          {t("taskbar.log.title")}
          {entries.length > 0 && (
            <span className="ml-1.5 font-mono text-[10px]">{entries.length}</span>
          )}
        </span>
        <div className="flex items-center gap-0.5">
          {/* 暂停/继续 — 始终可见 */}
          <Button
            variant="ghost" size="icon" className="size-6"
            disabled={entries.length === 0}
            onClick={() => setPaused((p) => !p)}
            title={paused ? t("taskbar.log.resume") : t("taskbar.log.pause")}
          >
            {paused ? <Play className="size-3" /> : <Pause className="size-3" />}
          </Button>
          {/* 清空 — 始终可见 */}
          <Button
            variant="ghost" size="icon" className="size-6"
            disabled={entries.length === 0}
            onClick={handleClear}
            title={t("taskbar.log.clear")}
          >
            <Trash2 className="size-3" />
          </Button>
          {/* 导出 — 始终可见 */}
          <Button
            variant="ghost" size="icon" className="size-6"
            disabled={entries.length === 0}
            onClick={() => void exportLog()}
            title={t("taskbar.log.export")}
          >
            <Download className="size-3" />
          </Button>
          {/* 展开/收起 */}
          <Button
            variant="ghost" size="icon" className="size-6"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? t("taskbar.log.collapse") : t("taskbar.log.expand")}
          >
            {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </Button>
        </div>
      </div>

      {/* 日志内容 */}
      <div
        ref={scrollRef}
        className="overflow-y-auto font-mono text-xs leading-5"
        style={{
          height: expanded ? "100%" : "120px",
          width: expanded ? `${logWidth}px` : "100%",
          maxWidth: expanded ? `${window.innerWidth * MAX_WIDTH_PCT}px` : "100%",
          wordBreak: "break-all",
          whiteSpace: "pre-wrap",
        }}
      >
        {entries.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            {emptyText ?? t("taskbar.log.empty")}
          </div>
        ) : (
          entries.map((e) => {
            const level = isErrorLine(e.line);
            return (
              <div
                key={e.seq}
                className={cn(
                  "px-2 py-[1px] hover:bg-accent/30",
                  level === "error" && "bg-destructive/10 text-destructive",
                  level === "warning" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                )}
              >
                {e.line}
              </div>
            );
          })
        )}
      </div>

      {/* 展开状态下右侧拖拽手柄 */}
      {expanded && (
        <div
          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors"
          title={t("taskbar.log.resize")}
          onMouseDown={onResizeStart}
        >
          <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 text-muted-foreground">
            <GripVertical className="size-3" />
          </div>
        </div>
      )}

      {/* 清空确认弹窗 */}
      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("taskbar.log.clearConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>{t("taskbar.log.clearDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={doClear}>{t("taskbar.log.clear")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}