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

/** 每个任务的日志环形缓冲上限（行数），防止内存无限增长 */
const MAX_LOG_LINES = 3000;

interface TaskContextValue {
  /** 全部已知任务（含队列/当前/历史） */
  tasks: Map<string, TaskInfo>;
  /** 队列中的任务 id（按顺序） */
  queueIds: string[];
  currentId: string | null;
  stopping: boolean;
  /** 按任务 id 的日志缓冲 */
  logs: Map<string, LogEntry[]>;
  seqRef: React.MutableRefObject<number>;
  addTask: (task: NewTask) => Promise<TaskInfo | null>;
  stopTask: (id: string) => Promise<void>;
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
        // 已有历史任务的日志占位
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
    async (task: NewTask): Promise<TaskInfo | null> => {
      try {
        return await taskApi.add(task);
      } catch (e) {
        console.error(e);
        toast.error(t("error.taskAddFailed"));
        return null;
      }
    },
    [t],
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

  const value = useMemo<TaskContextValue>(
    () => ({
      tasks,
      queueIds,
      currentId,
      stopping,
      logs,
      seqRef,
      addTask,
      stopTask,
      removeTask,
      reorderTask,
      clearFinished,
      clearLog,
      statusLabel,
    }),
    [tasks, queueIds, currentId, stopping, logs, addTask, stopTask, removeTask, reorderTask, clearFinished, clearLog, statusLabel],
  );

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}

export function useTasks(): TaskContextValue {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error("useTasks must be used within TaskProvider");
  return ctx;
}