import { useMemo, useState } from "react";
import { Square, Plus, Loader2, CircleAlert, Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { LogView } from "./LogView";
import { QuickTaskDialog } from "./QuickTaskDialog";
import { useI18n } from "@/i18n";
import { useTasks } from "@/tasks/TaskProvider";
import { formatMs } from "@/lib/format";
import { analyzeFfmpegError } from "@/lib/ffmpegErrors";

export function TaskBottomBar() {
  const { t } = useI18n();
  const { tasks, queueIds, currentId, stopping, logs, guardAddTask, stopTask, clearLog, statusLabel } =
    useTasks();
  const [quickOpen, setQuickOpen] = useState(false);
  const [logExpanded, setLogExpanded] = useState(false);

  const current = currentId ? tasks.get(currentId) ?? null : null;
  const logTaskId = useMemo(() => {
    if (currentId) return currentId;
    if (queueIds.length > 0) return queueIds[0];
    let best: { id: string; at: number } | null = null;
    for (const task of tasks.values()) {
      if (task.finishedAt && (!best || task.finishedAt > best.at)) {
        best = { id: task.id, at: task.finishedAt };
      }
    }
    return best?.id ?? null;
  }, [currentId, queueIds, tasks]);

  const logEntries = logTaskId ? logs.get(logTaskId) ?? [] : [];
  const logTask = logTaskId ? tasks.get(logTaskId) : null;

  const running = !!current && current.status === "running";
  const queuedCount = queueIds.length;

  const { percent, timeMs, durationMs, speed, etaMs } = current?.progress ?? {
    percent: -1, timeMs: 0, durationMs: 0, speed: 0, etaMs: -1,
  };
  const determinate = percent >= 0 && durationMs > 0;

  return (
    <div className={cn(
      "flex shrink-0 flex-col border-t border-border bg-background transition-all",
      logExpanded ? "flex-1 min-h-[200px]" : "h-[200px]",
    )}>
      {/* 顶行：进度信息 + 控制按钮 */}
      <div className="flex shrink-0 items-center gap-4 px-4 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {current ? (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{current.name}</span>
                <Badge
                  variant={
                    current.status === "failed"
                      ? "destructive"
                      : current.status === "completed"
                        ? "outline"
                        : "secondary"
                  }
                  className={cn(
                    "shrink-0",
                    running && "bg-blue-600 text-white",
                    current.status === "queued" && "bg-muted text-muted-foreground",
                  )}
                >
                  {statusLabel(current.status)}
                </Badge>
                {stopping && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                <span>{t("taskbar.percent", { percent: Math.round(percent) })}</span>
                {timeMs > 0 && <span>{t("taskbar.elapsed", { time: formatMs(timeMs) })}</span>}
                {durationMs > 0 && <span>/ {formatMs(durationMs)}</span>}
                {speed > 0 && <span>{t("taskbar.speed", { speed: speed.toFixed(2) })}</span>}
                {etaMs >= 0 && <span>{t("taskbar.eta", { time: formatMs(etaMs) })}</span>}
              </div>
            </div>
          ) : queuedCount > 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("taskbar.queueCount", { count: queuedCount })}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CircleAlert className="size-4" />
              {t("taskbar.idle")}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" onClick={() => setQuickOpen(true)}>
            <Plus className="size-4" />{t("batch.add")}
          </Button>
          <Button size="sm" variant="destructive" disabled={!running}
            onClick={() => currentId && void stopTask(currentId)}>
            <Square className="size-3.5 fill-current" />{t("taskbar.stop")}
          </Button>
        </div>
      </div>

      {/* 进度条 */}
      <div className="shrink-0 px-4">
        {running && determinate ? (
          <Progress value={percent} className="h-1" />
        ) : running ? (
          <div className="relative h-1 overflow-hidden rounded-full bg-muted">
            <div className="absolute inset-y-0 w-1/3 animate-indeterminate rounded-full bg-primary/70" />
          </div>
        ) : (
          <div className="h-1" />
        )}
      </div>

      {/* 错误分析 */}
      {logTask?.status === "failed" && logEntries.length > 0 && (
        <div className="shrink-0 px-4 pb-1 pt-1">
          {(() => {
            const stderr = logEntries.map((e) => e.line).join("\n");
            const suggestions = analyzeFfmpegError(stderr);
            return suggestions.length > 0 ? (
              <div className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs">
                {suggestions.slice(0, 2).map((s, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <Lightbulb className="mt-0.5 size-3 shrink-0 text-destructive" />
                    <div>
                      <span className="font-medium text-destructive">{s.message}</span>
                      <span className="ml-1 text-muted-foreground">— {s.suggestion}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null;
          })()}
        </div>
      )}

      {/* 日志区 */}
      <div className="min-h-0 flex-1 px-2 pb-2">
        <LogView
          entries={logEntries}
          onClear={logTaskId ? () => clearLog(logTaskId) : undefined}
          emptyText={logTask ? t("taskbar.log.empty") : t("taskbar.noTask")}
          className="h-full rounded-md border border-border"
          expanded={logExpanded}
          onExpandedChange={setLogExpanded}
        />
      </div>

      <QuickTaskDialog open={quickOpen} onOpenChange={setQuickOpen} onAdd={(nt) => void guardAddTask(nt)} />
    </div>
  );
}