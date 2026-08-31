import { useMemo, useState } from "react";
import { Square, Plus, Loader2, CircleAlert, Lightbulb, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { LogView, loadLogWidth, persistLogWidth } from "./LogView";
import { QuickTaskDialog } from "./QuickTaskDialog";
import { useI18n } from "@/i18n";
import { useTasks } from "@/tasks/TaskProvider";
import { formatMs } from "@/lib/format";
import { analyzeFfmpegError } from "@/lib/ffmpegErrors";

/** 日志面板三态：收起（小条）/ 展开（完整面板）/ 隐藏（整个组件消失） */
export type LogPanelState = "collapsed" | "expanded" | "hidden";

/** 展开高度：占主窗口垂直空间 ~45% */
const EXPANDED_HEIGHT_PCT = 0.45;

export function TaskBottomBar({
  state,
  onStateChange,
  tabId,
}: {
  state: LogPanelState;
  onStateChange: (s: LogPanelState) => void;
  /** 标签 id：只展示属于该标签的任务/日志（多标签隔离）；缺省展示全局 */
  tabId?: string;
}) {
  const { t } = useI18n();
  const { tasks, queueIds, currentId, stopping, logs, taskTabMap, guardAddTask, stopTask, clearLog, statusLabel } =
    useTasks();
  const [quickOpen, setQuickOpen] = useState(false);
  const [logWidth, setLogWidth] = useState(loadLogWidth);

  const logExpanded = state === "expanded";

  // 多标签过滤：只保留归属于本标签（tabId）的任务；缺省 tabId 展示全部
  const ownIds = useMemo(() => {
    if (!tabId) return null; // 全局视图
    const set = new Set<string>();
    for (const [taskId, owner] of taskTabMap) {
      if (owner === tabId) set.add(taskId);
    }
    return set;
  }, [tabId, taskTabMap]);

  const ownTasks = useMemo(() => {
    if (!ownIds) return tasks;
    const m = new Map<string, typeof tasks extends Map<string, infer V> ? V : never>();
    for (const id of ownIds) {
      const task = tasks.get(id);
      if (task) m.set(id, task);
    }
    return m;
  }, [ownIds, tasks]);

  const ownQueueIds = useMemo(() => (ownIds ? queueIds.filter((id) => ownIds.has(id)) : queueIds), [ownIds, queueIds]);
  const ownCurrentId = ownIds && currentId && ownIds.has(currentId) ? currentId : null;

  const current = ownCurrentId ? ownTasks.get(ownCurrentId) ?? null : null;
  const logTaskId = useMemo(() => {
    if (ownCurrentId) return ownCurrentId;
    if (ownQueueIds.length > 0) return ownQueueIds[0];
    let best: { id: string; at: number } | null = null;
    for (const task of ownTasks.values()) {
      if (task.finishedAt && (!best || task.finishedAt > best.at)) {
        best = { id: task.id, at: task.finishedAt };
      }
    }
    return best?.id ?? null;
  }, [ownCurrentId, ownQueueIds, ownTasks]);

  const logEntries = logTaskId ? logs.get(logTaskId) ?? [] : [];
  const logTask = logTaskId ? ownTasks.get(logTaskId) : null;

  const running = !!current && current.status === "running";
  const queuedCount = ownQueueIds.length;

  const { percent, timeMs, durationMs, speed, etaMs } = current?.progress ?? {
    percent: -1, timeMs: 0, durationMs: 0, speed: 0, etaMs: -1,
  };
  const determinate = percent >= 0 && durationMs > 0;

  const resizeWidth = (w: number) => {
    setLogWidth(w);
    persistLogWidth(w);
  };

  // 错误建议（失败任务）
  const errorSuggestions = useMemo(() => {
    if (logTask?.status !== "failed" || logEntries.length === 0) return [];
    return analyzeFfmpegError(logEntries.map((e) => e.line).join("\n"));
  }, [logTask, logEntries]);

  // 完全隐藏：整个组件不渲染（透明度参数随之不生效；恢复后立即生效）
  if (state === "hidden") return null;

  return (
    <div
      data-slot="taskbar"
      className={cn(
        "flex shrink-0 flex-col border-t border-border transition-[height] duration-200 ease-out",
        // 开启自定义背景时：日志面板半透明磨砂（由 AppShell 的 bg-glass-enabled 驱动）
        "bg-background",
        logExpanded ? "min-h-0" : "h-[200px]",
      )}
      style={logExpanded ? { height: `${Math.round(window.innerHeight * EXPANDED_HEIGHT_PCT)}px` } : undefined}
    >
      {/* 顶行：进度信息 + 控制按钮 */}
      <div className="flex h-11 shrink-0 items-center gap-4 border-b border-border px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {current ? (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{current.name}</span>
                <Badge
                  variant={current.status === "failed" ? "destructive" : current.status === "completed" ? "outline" : "secondary"}
                  className={cn("shrink-0", running && "bg-blue-600 text-white", current.status === "queued" && "bg-muted text-muted-foreground")}
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
      <div className="shrink-0 border-b border-border px-4 py-1">
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

      {/* 内容区：收起=日志全宽；展开=左侧详情 + 右侧可调宽日志 */}
      <div className="flex min-h-0 flex-1">
        {logExpanded ? (
          <>
            {/* 左：当前任务详情 */}
            <div className="min-w-0 flex-1 overflow-y-auto p-4">
              {current ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Info className="size-4" />
                      {current.name}
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-3">
                      <Detail label={t("taskbar.percent", { percent: Math.round(percent) })} value={determinate ? `${percent.toFixed(1)}%` : "—"} />
                      <Detail label={t("taskbar.elapsed", { time: formatMs(timeMs) })} value={formatMs(timeMs)} />
                      {durationMs > 0 && <Detail label="时长" value={formatMs(durationMs)} />}
                      {speed > 0 && <Detail label="速度" value={`${speed.toFixed(2)}x`} />}
                      {etaMs >= 0 && <Detail label="剩余" value={formatMs(etaMs)} />}
                      <Detail label={t("taskbar.status")} value={statusLabel(current.status)} />
                    </div>
                  </div>
                  <div className="min-w-0 break-all font-mono text-xs text-muted-foreground">
                    <div className="mb-0.5 font-sans font-medium text-foreground/80">Command</div>
                    {current.args.join(" ")}
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  {t("taskbar.noTask")}
                </div>
              )}
              {/* 错误建议 */}
              {errorSuggestions.length > 0 && (
                <div className="mt-2 space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs">
                  {errorSuggestions.slice(0, 3).map((s, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <Lightbulb className="mt-0.5 size-3 shrink-0 text-destructive" />
                      <div>
                        <span className="font-medium text-destructive">{s.message}</span>
                        <span className="ml-1 text-muted-foreground">— {s.suggestion}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* 右：日志面板（宽度可调） */}
            <LogView
              entries={logEntries}
              onClear={logTaskId ? () => clearLog(logTaskId) : undefined}
              emptyText={logTask ? t("taskbar.log.empty") : t("taskbar.noTask")}
              className="h-full shrink-0 border-l border-border"
              expanded
              onToggleExpanded={() => onStateChange("collapsed")}
              width={logWidth}
              onResizeWidth={resizeWidth}
            />
          </>
        ) : (
          /* 收起：日志全宽 */
          <div className="min-h-0 flex-1 px-2 pb-2">
            <LogView
              entries={logEntries}
              onClear={logTaskId ? () => clearLog(logTaskId) : undefined}
              emptyText={logTask ? t("taskbar.log.empty") : t("taskbar.noTask")}
              className="h-full rounded-md border border-border"
              expanded={false}
              onToggleExpanded={() => onStateChange("expanded")}
              width={logWidth}
              onResizeWidth={resizeWidth}
            />
          </div>
        )}
      </div>

      <QuickTaskDialog open={quickOpen} onOpenChange={setQuickOpen} onAdd={(nt) => void guardAddTask(nt, tabId)} />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}