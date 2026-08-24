import { invoke } from "@tauri-apps/api/core";
import type {
  NewTask,
  TaskInfo,
  TasksSnapshot,
} from "./types";

export const taskApi = {
  add: (task: NewTask) => invoke<TaskInfo>("task_add", { task }),
  stop: (id: string) => invoke<void>("task_stop", { id }),
  remove: (id: string) => invoke<void>("task_remove", { id }),
  reorder: (id: string, direction: "up" | "down") =>
    invoke<void>("task_reorder", { id, direction }),
  clearFinished: () => invoke<void>("task_clear_finished"),
  snapshot: () => invoke<TasksSnapshot>("tasks_snapshot"),
};

/** 导出文本文件（日志导出用；仅允许常见文本扩展名，后端校验） */
export async function writeTextFile(path: string, content: string): Promise<void> {
  await invoke("write_text_file", { path, content });
}