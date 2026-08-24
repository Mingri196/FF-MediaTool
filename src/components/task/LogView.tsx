import { useEffect, useMemo, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { Trash2, Download, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { writeTextFile } from "@/tasks/taskApi";
import type { LogEntry } from "@/tasks/types";

/**
 * 日志视图：实时滚动输出 FFmpeg stderr/stdout，支持暂停滚动、清空、导出。
 * 仅显示最后 MAX_VISIBLE 行（性能考虑），颜色分级：error 红 / warn 黄 / info 默认。
 */
const MAX_VISIBLE = 2000;

export function LogView({
  entries,
  onClear,
  className,
  emptyText,
}: {
  entries: LogEntry[];
  onClear?: () => void;
  className?: string;
  emptyText: string;
}) {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const [expanded, setExpanded] = useState(false);

  // 自动滚动跟随（用户上滚即暂停跟随）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !follow) return;
    el.scrollTop = el.scrollHeight;
  }, [entries, follow]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (nearBottom !== follow) setFollow(nearBottom);
  };

  const visible = useMemo(
    () => (entries.length > MAX_VISIBLE ? entries.slice(-MAX_VISIBLE) : entries),
    [entries],
  );

  const exportLog = async () => {
    if (entries.length === 0) return;
    try {
      const path = await save({
        title: t("taskbar.log.export"),
        defaultPath: `ff-mediatool-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`,
        filters: [{ name: "Text", extensions: ["txt", "log"] }],
      });
      if (!path) return;
      const content = entries
        .map((e) => `${new Date(e.ts).toLocaleTimeString()} [${e.level}] ${e.line}`)
        .join("\n");
      await writeTextFile(path, content);
      toast.success(t("common.done"));
    } catch (e) {
      console.error(e);
      toast.error(t("error.exportLogFailed"));
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {/* 工具栏 */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1">
        <span className="mr-1 text-[11px] font-medium text-muted-foreground">
          {t("taskbar.log.title")}
        </span>
        <span className="text-[11px] text-muted-foreground/70">
          {t("taskbar.log.totalLines", { count: entries.length })}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            title={follow ? t("taskbar.log.pause") : t("taskbar.log.resume")}
            onClick={() => setFollow((f) => !f)}
          >
            {follow ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            title={t("taskbar.log.clear")}
            onClick={() => onClear?.()}
            disabled={!onClear || entries.length === 0}
          >
            <Trash2 className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            title={t("taskbar.log.export")}
            onClick={() => void exportLog()}
            disabled={entries.length === 0}
          >
            <Download className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            title={expanded ? t("taskbar.log.collapse") : t("taskbar.log.expand")}
            onClick={() => setExpanded((e) => !e)}
          >
            <ExpandIcon expanded={expanded} />
          </Button>
        </div>
      </div>

      {/* 日志区 */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto bg-muted/30 px-2 py-1 font-mono text-[11px] leading-5",
          expanded ? "h-64" : "h-28",
        )}
      >
        {visible.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground/70">
            {emptyText}
          </div>
        ) : (
          visible.map((e) => (
            <div
              key={e.seq}
              className={cn(
                "whitespace-pre-wrap break-all",
                e.level === "error" && "text-red-600 dark:text-red-400",
                e.level === "warn" && "text-amber-600 dark:text-amber-400",
                e.level === "info" && "text-foreground/80",
              )}
            >
              {e.line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ExpandIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
    >
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}