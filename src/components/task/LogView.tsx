import { useEffect, useRef, useState } from "react";
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

const WIDTH_KEY = "ffmt-log-width";
export const DEFAULT_LOG_WIDTH = 420;
export const MIN_LOG_WIDTH = 220;
export const MAX_LOG_WIDTH_PCT = 0.7;

export function loadLogWidth(): number {
  try {
    const v = localStorage.getItem(WIDTH_KEY);
    if (v) return Math.max(MIN_LOG_WIDTH, Math.min(window.innerWidth * MAX_LOG_WIDTH_PCT, Number(v)));
  } catch { /* ignore */ }
  return DEFAULT_LOG_WIDTH;
}

export function persistLogWidth(w: number) {
  try { localStorage.setItem(WIDTH_KEY, String(w)); } catch { /* ignore */ }
}

/**
 * 日志面板（v0.20 修复版）：
 * - 等宽字体 + 统一行高，语义折行（break-words）不横向溢出
 * - 错误/警告整行高亮，多行换行连续不断裂
 * - 垂直滚动条贴右缘，滚动范围与内容匹配
 * - 组件常驻（收起时仅改变尺寸），滚动位置 / 暂停状态天然保持同步
 * - 宽度由父级传入（展开时右侧列），宽度记忆由 TaskBottomBar 负责
 */
export function LogView({
  entries,
  onClear,
  emptyText,
  className,
  expanded,
  onToggleExpanded,
  width,
  onResizeWidth,
}: {
  entries: LogEntry[];
  onClear?: () => void;
  emptyText?: string;
  className?: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  width: number;
  onResizeWidth: (w: number) => void;
}) {
  const { t } = useI18n();
  const [paused, setPaused] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  // 自动滚动到底部（除非暂停；组件常驻，收起时同样跟随）
  useEffect(() => {
    if (paused || !scrollRef.current) return;
    const el = scrollRef.current;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (isNearBottom) el.scrollTop = el.scrollHeight;
  }, [entries, paused]);

  // 右侧边缘拖拽调整宽度
  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = true;
    startX.current = e.clientX;
    startW.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = ev.clientX - startX.current;
      const maxW = window.innerWidth * MAX_LOG_WIDTH_PCT;
      const next = Math.max(MIN_LOG_WIDTH, Math.min(maxW, startW.current + delta));
      onResizeWidth(next);
    };
    const onUp = () => {
      dragRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
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
    <>
      <div
        className={cn("relative flex flex-col overflow-hidden", className)}
        style={expanded ? { width: `${width}px`, maxWidth: `${window.innerWidth * MAX_LOG_WIDTH_PCT}px` } : undefined}
      >
        {/* 工具栏 —— 收起/展开均可见 */}
        <div className="flex h-8 shrink-0 items-center justify-between border-b border-border pl-2 pr-1">
          <span className="truncate text-xs font-medium text-muted-foreground">
            {t("taskbar.log.title")}
            {entries.length > 0 && (
              <span className="ml-1.5 font-mono text-[10px]">{entries.length}</span>
            )}
          </span>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button variant="ghost" size="icon" className="size-6" disabled={entries.length === 0}
              onClick={() => setPaused((p) => !p)}
              title={paused ? t("taskbar.log.resume") : t("taskbar.log.pause")}>
              {paused ? <Play className="size-3" /> : <Pause className="size-3" />}
            </Button>
            <Button variant="ghost" size="icon" className="size-6" disabled={entries.length === 0}
              onClick={() => setConfirmClear(true)} title={t("taskbar.log.clear")}>
              <Trash2 className="size-3" />
            </Button>
            <Button variant="ghost" size="icon" className="size-6" disabled={entries.length === 0}
              onClick={() => void exportLog()} title={t("taskbar.log.export")}>
              <Download className="size-3" />
            </Button>
            <Button variant="ghost" size="icon" className="size-6"
              onClick={onToggleExpanded}
              title={expanded ? t("taskbar.log.collapse") : t("taskbar.log.expand")}>
              {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </Button>
          </div>
        </div>

        {/* 日志内容：统一行高、语义折行、滚动条贴右缘 */}
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1 font-mono text-xs leading-6 dark:text-foreground"
          style={{ wordBreak: "break-word", whiteSpace: "pre-wrap" }}
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
                    "pl-2 pr-1 whitespace-pre-wrap",
                    level === "error" && "bg-destructive/15 text-destructive dark:text-red-300",
                    level === "warning" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                    !level && "hover:bg-accent/40",
                  )}
                >
                  {e.line}
                </div>
              );
            })
          )}
        </div>

        {/* 展开状态：右侧拖拽手柄 */}
        {expanded && (
          <div
            className="absolute -right-1 top-0 bottom-0 z-10 flex w-2 cursor-col-resize items-center justify-center hover:bg-primary/25 active:bg-primary/40"
            title={t("taskbar.log.resize")}
            onMouseDown={onResizeStart}
          >
            <GripVertical className="size-3 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* 清空确认 */}
      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("taskbar.log.clearConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>{t("taskbar.log.clearDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onClear?.(); setConfirmClear(false); }}>
              {t("taskbar.log.clear")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}