import { useEffect, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { Trash2, Download, Pause, Play, Maximize2, Minimize2, GripHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { api } from "@/lib/tauri";
import { isErrorLine } from "@/lib/ffmpegErrors";
import type { LogEntry } from "@/tasks/types";

const DEFAULT_HEIGHT = 120; // px
const EXPANDED_MIN = 200;
const EXPANDED_MAX = 600;

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
  const [logHeight, setLogHeight] = useState(DEFAULT_HEIGHT);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  // 自动滚动到底部（除非暂停）
  useEffect(() => {
    if (paused || !scrollRef.current) return;
    const el = scrollRef.current;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries, paused]);

  // 拖拽调整高度
  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = true;
    startY.current = e.clientY;
    startH.current = logHeight;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = ev.clientY - startY.current;
      const next = Math.max(EXPANDED_MIN, Math.min(EXPANDED_MAX, startH.current + delta));
      setLogHeight(next);
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

  const height = expanded ? Math.max(EXPANDED_MIN, logHeight) : DEFAULT_HEIGHT;

  return (
    <div className={cn("flex flex-col", className)}>
      {/* 工具栏 */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-2 py-1">
        <span className="text-xs font-medium text-muted-foreground">
          {t("taskbar.log.title")}
          {entries.length > 0 && (
            <span className="ml-1.5 font-mono text-[10px]">{entries.length}</span>
          )}
        </span>
        <div className="flex items-center gap-0.5">
          {expanded && (
            <>
              <button
                type="button"
                className="cursor-row-resize rounded p-0.5 text-muted-foreground hover:bg-accent"
                title={t("taskbar.log.resize")}
                onMouseDown={onMouseDown}
              >
                <GripHorizontal className="size-3.5" />
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                disabled={entries.length === 0}
                onClick={() => setPaused((p) => !p)}
                title={paused ? t("taskbar.log.resume") : t("taskbar.log.pause")}
              >
                {paused ? <Play className="size-3" /> : <Pause className="size-3" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                disabled={entries.length === 0}
                onClick={onClear}
                title={t("taskbar.log.clear")}
              >
                <Trash2 className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                disabled={entries.length === 0}
                onClick={() => void exportLog()}
                title={t("taskbar.log.export")}
              >
                <Download className="size-3" />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
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
        style={{ height: `${height}px`, wordBreak: "break-all", whiteSpace: "pre-wrap" }}
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
    </div>
  );
}