import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { taskApi } from "./taskApi";
import type {
  LogEntry,
  NewTask,
  TaskEvent,
  TaskInfo,
  TaskStatus,
} from "./types";
import { useI18n } from "@/i18n";
import { api } from "@/lib/tauri";
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

/** 每个任务的日志环形缓冲上限（行数），防止内存无限增长 */
const MAX_LOG_LINES = 3000;

interface TaskContextValue {
  tasks: Map<string, TaskInfo>;
  queueIds: string[];
  currentId: string | null;
  stopping: boolean;
  logs: Map<string, LogEntry[]>;
  seqRef: React.MutableRefObject<number>;
  /** 任务归属标签映射：taskId -> tabId（多标签隔离用；无归属的任务缺省为空串） */
  taskTabMap: Map<string, string>;
  addTask: (task: NewTask) => Promise<TaskInfo | null>;
  /** 带文件保护 + 参数校验的添加任务（PRD 6.3）；tabId 用于任务归属标签（多标签隔离） */
  guardAddTask: (task: NewTask, tabId?: string) => Promise<void>;
  stopTask: (id: string) => Promise<void>;
  /** 停止某标签归属的所有运行/排队任务（关闭标签时使用） */
  stopTabTasks: (tabId: string) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  reorderTask: (id: string, dir: "up" | "down") => Promise<void>;
  clearFinished: () => Promise<void>;
  clearLog: (id: string) => void;
  statusLabel: (s: TaskStatus) => string;
}

const TaskContext = createContext<TaskContextValue | null>(null);

export function TaskProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [tasks, setTasks] = useState<Map<string, TaskInfo>>(new Map());
  const [queueIds, setQueueIds] = useState<string[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [logs, setLogs] = useState<Map<string, LogEntry[]>>(new Map());
  const seqRef = useRef(0);
  const [conflict, setConflict] = useState<{ task: NewTask; resolve: (action: "overwrite" | "rename" | "cancel") => void } | null>(null);
  // 任务归属标签：taskId -> tabId（"" 表示无归属 / 全局任务）
  const [taskTabMap, setTaskTabMap] = useState<Map<string, string>>(new Map());
  const taskTabRef = useRef<Map<string, string>>(new Map());
  taskTabRef.current = taskTabMap;

  // ---- 事件订阅 ----
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const handle = (event: { payload: TaskEvent }) => {
      if (cancelled) return;
      const ev = event.payload;
      if (ev.type === "taskUpdated") {
        setTasks((prev) => {
          const next = new Map(prev);
          next.set(ev.task.id, ev.task);
          return next;
        });
      } else if (ev.type === "log") {
        const entry: LogEntry = {
          seq: ++seqRef.current,
          level: ev.level,
          line: ev.line,
          ts: Date.now(),
        };
        setLogs((prev) => {
          const next = new Map(prev);
          const cur = next.get(ev.taskId) ?? [];
          const merged = cur.length >= MAX_LOG_LINES
            ? [...cur.slice(cur.length - MAX_LOG_LINES + 1), entry]
            : [...cur, entry];
          next.set(ev.taskId, merged);
          return next;
        });
      } else if (ev.type === "queueChanged") {
        setQueueIds(ev.queue);
        setCurrentId(ev.current);
        setStopping(ev.stopping);
      }
    };

    const init = async () => {
      try {
        const snap = await taskApi.snapshot();
        if (cancelled) return;
        setTasks(new Map([
          ...snap.queue.map((x) => [x.id, x] as const),
          ...(snap.current ? [[snap.current.id, snap.current] as const] : []),
          ...snap.history.map((x) => [x.id, x] as const),
        ]));
        setQueueIds(snap.queue.map((x) => x.id));
        setCurrentId(snap.current?.id ?? null);
        setStopping(snap.stopping);
        setLogs((prev) => {
          const next = new Map(prev);
          for (const task of [...snap.history, ...snap.queue, ...(snap.current ? [snap.current] : [])]) {
            if (!next.has(task.id)) next.set(task.id, []);
          }
          return next;
        });
      } catch (e) {
        console.error("读取任务快照失败", e);
      }
    };

    void init();
    listen<TaskEvent>("task://event", handle).then((fn) => {
      unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // ---- 动作 ----
  const addTask = useCallback(
    async (task: NewTask, tabId?: string): Promise<TaskInfo | null> => {
      try {
        const created = await taskApi.add(task);
        if (created) {
          // 记录任务归属标签（复制/关闭标签时需要）
          setTaskTabMap((prev) => new Map(prev).set(created.id, tabId ?? ""));
        }
        return created;
      } catch (e) {
        console.error(e);
        toast.error(t("error.taskAddFailed"));
        return null;
      }
    },
    [t],
  );

  /** 带文件保护 + 参数校验的添加任务（PRD 6.3） */
  const guardAddTask = useCallback(
    async (task: NewTask, tabId?: string) => {
      if (task.args.length === 0) {
        toast.error(t("error.taskAddFailed"));
        return;
      }
      // 文件保护：检查输出文件是否存在
      try {
        const check = await api.checkOutputFile(task.outputPath);
        if (check.exists) {
          return new Promise<void>((resolve) => {
            setConflict({ task: { ...task }, resolve: (action) => {
              const t = task;
              if (action === "cancel") { resolve(); return; }
              if (action === "rename") {
                const dot = t.outputPath.lastIndexOf(".");
                const slash = Math.max(t.outputPath.lastIndexOf("\\"), t.outputPath.lastIndexOf("/"));
                t.outputPath = dot > slash
                  ? t.outputPath.slice(0, dot) + "_1" + t.outputPath.slice(dot)
                  : t.outputPath + "_1";
                t.name = `${t.inputPath.split(/[\\/]/).pop() ?? ""} → ${t.outputPath.split(/[\\/]/).pop() ?? ""}`;
                if (t.args.length > 0) t.args[t.args.length - 1] = t.outputPath;
              }
              addTask(t, tabId);
              resolve();
            }});
          });
        }
      } catch { /* 检查失败则继续 */ }
      addTask(task, tabId);
    },
    [addTask, t],
  );

  const stopTask = useCallback(
    async (id: string) => {
      try {
        await taskApi.stop(id);
      } catch (e) {
        console.error(e);
        toast.error(t("error.taskStopFailed"));
      }
    },
    [t],
  );

  const removeTask = useCallback(
    async (id: string) => {
      try {
        await taskApi.remove(id);
      } catch (e) {
        console.error(e);
        toast.error(t("error.taskRemoveFailed"));
      }
    },
    [t],
  );

  const reorderTask = useCallback(
    async (id: string, dir: "up" | "down") => {
      try {
        await taskApi.reorder(id, dir);
      } catch (e) {
        console.error(e);
      }
    },
    [],
  );

  const clearFinished = useCallback(async () => {
    try {
      await taskApi.clearFinished();
      setTasks((prev) => {
        const next = new Map(prev);
        for (const [id, task] of prev) {
          const finished = task.status === "completed" || task.status === "failed" || task.status === "cancelled";
          const inQueue = queueIds.includes(id);
          if (finished && !inQueue && id !== currentId) next.delete(id);
        }
        return next;
      });
    } catch (e) {
      console.error(e);
    }
  }, [queueIds, currentId]);

  const clearLog = useCallback((id: string) => {
    setLogs((prev) => {
      const next = new Map(prev);
      next.set(id, []);
      return next;
    });
  }, []);

  const statusLabel = useCallback(
    (s: TaskStatus) => {
      const key: Record<TaskStatus, Parameters<typeof t>[0]> = {
        queued: "status.queued",
        running: "status.running",
        completed: "status.completed",
        failed: "status.failed",
        cancelled: "status.cancelled",
      };
      return t(key[s]);
    },
    [t],
  );

  /** 停止某标签归属的所有运行/排队任务（关闭标签时使用） */
  const stopTabTasks = useCallback(
    async (tabId: string) => {
      for (const [taskId, owner] of taskTabRef.current) {
        if (owner !== tabId) continue;
        const task = tasks.get(taskId);
        if (task && (task.status === "running" || task.status === "queued")) {
          try {
            await taskApi.stop(taskId);
          } catch (e) {
            console.error(e);
          }
        }
      }
    },
    [tasks],
  );

  const value = useMemo<TaskContextValue>(
    () => ({
      tasks, queueIds, currentId, stopping, logs, seqRef, taskTabMap,
      addTask, guardAddTask, stopTask, removeTask, reorderTask,
      clearFinished, clearLog, statusLabel, stopTabTasks,
    }),
    [tasks, queueIds, currentId, stopping, logs, taskTabMap, addTask, guardAddTask, stopTask, removeTask, reorderTask, clearFinished, clearLog, statusLabel, stopTabTasks],
  );

  return (
    <TaskContext.Provider value={value}>
      {children}
      <OutputConflictDialog
        open={!!conflict}
        taskName={conflict?.task.outputPath}
        onOverwrite={() => { conflict?.resolve("overwrite"); setConflict(null); }}
        onRename={() => { conflict?.resolve("rename"); setConflict(null); }}
        onCancel={() => { conflict?.resolve("cancel"); setConflict(null); }}
      />
    </TaskContext.Provider>
  );
}

function OutputConflictDialog({
  open, taskName, onOverwrite, onRename, onCancel,
}: {
  open: boolean; taskName?: string; onOverwrite: () => void; onRename: () => void; onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("fileguard.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("fileguard.desc", { path: taskName ?? "" })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onRename} variant="outline">{t("fileguard.rename")}</AlertDialogAction>
          <AlertDialogAction onClick={onOverwrite}>{t("fileguard.overwrite")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function useTasks(): TaskContextValue {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error("useTasks must be used within TaskProvider");
  return ctx;
}