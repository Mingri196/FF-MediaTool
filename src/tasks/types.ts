/** 与 src-tauri/src/task/model.rs 一一对应（camelCase） */

export type TaskStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface TaskProgress {
  /** 0..=100；未知（如取不到总时长）为 -1 */
  percent: number;
  /** 已处理时长（毫秒） */
  timeMs: number;
  /** 总时长（毫秒，ffprobe 预取）；未知为 0 */
  durationMs: number;
  /** 处理速度（倍速）；未知为 0 */
  speed: number;
  /** 剩余预估（毫秒）；未知为 -1 */
  etaMs: number;
}

export interface TaskInfo {
  id: string;
  name: string;
  status: TaskStatus;
  /** 完整 ffmpeg 参数（不含自动附加项） */
  args: string[];
  inputPath: string;
  outputPath: string;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  progress: TaskProgress;
  error: string | null;
}

export interface NewTask {
  name: string;
  args: string[];
  inputPath: string;
  outputPath: string;
}

export interface TasksSnapshot {
  queue: TaskInfo[];
  current: TaskInfo | null;
  history: TaskInfo[];
  stopping: boolean;
}

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  seq: number;
  level: LogLevel;
  line: string;
  ts: number;
}

/** 后端推送的统一事件（task://event） */
export type TaskEvent =
  | { type: "taskUpdated"; task: TaskInfo }
  | { type: "log"; taskId: string; line: string; level: LogLevel }
  | {
      type: "queueChanged";
      queue: string[];
      current: string | null;
      stopping: boolean;
    };