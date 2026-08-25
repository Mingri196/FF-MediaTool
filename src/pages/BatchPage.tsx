import { useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  X,
  Plus,
  RotateCcw,
  ListOrdered,
  CheckCircle2,
  XCircle,
  History,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useTasks } from "@/tasks/TaskProvider";
import { QuickTaskDialog } from "@/components/task/QuickTaskDialog";
import { basename, formatMs } from "@/lib/format";
import type { NewTask, TaskInfo, TaskStatus } from "@/tasks/types";

function StatusBadge({ status }: { status: TaskStatus }) {
  const { statusLabel } = useTasks();
  return (
    <Badge
      variant={
        status === "failed"
          ? "destructive"
          : status === "completed"
            ? "outline"
            : "secondary"
      }
      className={cn(
        status === "running" && "bg-blue-600 text-white",
        status === "queued" && "bg-muted text-muted-foreground",
      )}
    >
      {statusLabel(status)}
    </Badge>
  );
}

/** 批量任务页：队列顺序管理 + 状态展示 + 历史记录 + 重试 */
export function BatchPage() {
  const { t } = useI18n();
  const {
    tasks,
    queueIds,
    currentId,
    guardAddTask,
    addTask,
    stopTask,
    removeTask,
    reorderTask,
    clearFinished,
  } = useTasks();
  const [quickOpen, setQuickOpen] = useState(false);

  const queued = queueIds.map((id) => tasks.get(id)).filter(Boolean) as TaskInfo[];
  const current = currentId ? tasks.get(currentId) ?? null : null;
  const history = [...tasks.values()]
    .filter(
      (x) =>
        x.id !== currentId &&
        !queueIds.includes(x.id) &&
        ["completed", "failed", "cancelled"].includes(x.status),
    )
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));

  const retry = (task: TaskInfo) => {
    void addTask({
      name: task.name,
      args: task.args,
      inputPath: task.inputPath,
      outputPath: task.outputPath,
    } satisfies NewTask);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">{t("batch.title")}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("batch.desc")}</p>
          </div>
          <Button onClick={() => setQuickOpen(true)}>
            <Plus className="size-4" />
            {t("batch.add")}
          </Button>
        </div>

        {/* 当前任务 */}
        {current && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="size-2 animate-pulse rounded-full bg-blue-600" />
                {t("batch.current")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Row
                name={current.name}
                status={current.status}
                progress={current.progress}
                onStop={() => current.id && void stopTask(current.id)}
              />
            </CardContent>
          </Card>
        )}

        {/* 排队队列 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ListOrdered className="size-4" />
              {t("batch.queue")}
              {queued.length > 0 && (
                <Badge variant="secondary">{queued.length}</Badge>
              )}
            </CardTitle>
            <CardDescription>
              {t("taskbar.queueCount", { count: queued.length })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {queued.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                {t("batch.emptyQueue")}
              </p>
            ) : (
              <ScrollArea className="max-h-72">
                <ul className="divide-y divide-border">
                  {queued.map((task, idx) => (
                    <li key={task.id} className="flex items-center gap-3 py-2">
                      <span className="w-6 shrink-0 text-center text-sm text-muted-foreground">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium" title={task.outputPath}>
                          {task.name}
                        </div>
                        <div className="truncate font-mono text-xs text-muted-foreground">
                          {basename(task.outputPath)}
                        </div>
                      </div>
                      <StatusBadge status={task.status} />
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          disabled={idx === 0}
                          title={t("batch.moveUp")}
                          onClick={() => void reorderTask(task.id, "up")}
                        >
                          <ArrowUp className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          disabled={idx === queued.length - 1}
                          title={t("batch.moveDown")}
                          onClick={() => void reorderTask(task.id, "down")}
                        >
                          <ArrowDown className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive hover:text-destructive"
                          title={t("batch.remove")}
                          onClick={() => void removeTask(task.id)}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* 历史记录 */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="size-4" />
                {t("batch.history")}
                {history.length > 0 && (
                  <Badge variant="secondary">{history.length}</Badge>
                )}
              </CardTitle>
              {history.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => void clearFinished()}>
                  {t("batch.clearFinished")}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                {t("batch.emptyHistory")}
              </p>
            ) : (
              <ScrollArea className="max-h-64">
                <ul className="divide-y divide-border">
                  {history.map((task) => (
                    <li key={task.id} className="flex items-center gap-3 py-2">
                      {task.status === "completed" ? (
                        <CheckCircle2 className="size-4 shrink-0 text-green-600" />
                      ) : (
                        <XCircle className="size-4 shrink-0 text-destructive" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {task.name}
                          {task.error && (
                            <span className="ml-2 text-xs text-destructive">
                              {task.error}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="truncate font-mono">
                            {basename(task.outputPath)}
                          </span>
                          {task.finishedAt && task.startedAt && (
                            <span>
                              {formatMs(task.finishedAt - task.startedAt)}
                            </span>
                          )}
                        </div>
                      </div>
                      <StatusBadge status={task.status} />
                      {task.status === "failed" && (
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-7"
                          title={t("batch.retry")}
                          onClick={() => retry(task)}
                        >
                          <RotateCcw className="size-3.5" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      <QuickTaskDialog open={quickOpen} onOpenChange={setQuickOpen} onAdd={(nt) => void guardAddTask(nt)} />
    </div>
  );
}

function Row({
  name,
  status,
  progress,
  onStop,
}: {
  name: string;
  status: TaskStatus;
  progress: { percent: number; timeMs: number; durationMs: number; speed: number; etaMs: number };
  onStop: () => void;
}) {
  const { t } = useI18n();
  const running = status === "running";
  const determinate = progress.percent >= 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm" title={name}>
          {name}
        </span>
        <StatusBadge status={status} />
        {running && (
          <Button variant="destructive" size="sm" onClick={onStop}>
            {t("taskbar.stop")}
          </Button>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {determinate ? (
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${Math.min(100, progress.percent)}%` }}
            />
          </div>
        ) : running ? (
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="absolute inset-y-0 w-1/3 animate-indeterminate rounded-full bg-primary/70" />
          </div>
        ) : (
          <div className="h-1.5 flex-1" />
        )}
        <span>
          {t("taskbar.percent", { percent: Math.round(progress.percent) })} ·{" "}
          {formatMs(progress.timeMs)}
          {progress.durationMs > 0 && ` / ${formatMs(progress.durationMs)}`}
          {progress.speed > 0 && ` · ${progress.speed.toFixed(2)}x`}
          {progress.etaMs >= 0 && ` · ${t("taskbar.eta", { time: formatMs(progress.etaMs) })}`}
        </span>
      </div>
    </div>
  );
}