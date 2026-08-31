//! 任务管理器：串行队列调度 + 任务生命周期 + IPC 命令。
//!
//! 设计要点：
//! - **串行调度**：同一时刻只跑一个 ffmpeg 进程，避免 CPU/磁盘满载（PRD 6.2）
//! - 停止时杀整个进程树并回收（PRD 6.3），杜绝残留；child 经共享 slot 传递，
//!   **spawn 与 stop 之间无竞态窗口**
//! - 状态与进度通过 `task://event` 事件实时推送到前端

pub mod model;
pub mod progress;
pub mod runner;

use std::collections::{HashMap, VecDeque};
use std::sync::Arc;

use tauri::{AppHandle, State};
use tokio::sync::{Mutex, Notify};

use model::{NewTask, TaskInfo, TaskStatus, TasksSnapshot};
use runner::{build_command, kill_tree};

const MAX_HISTORY: usize = 20;

pub struct TaskManager {
    inner: Mutex<Inner>,
    /// 队列变化或需要唤醒调度循环时 notify
    notify: Notify,
}

struct Inner {
    tasks: HashMap<String, TaskInfo>,
    queue: VecDeque<String>,
    current: Option<String>,
    /// 当前运行任务的进程 PID（spawn 后立即登记，stop 据此击杀进程树）
    child_pid: Option<u32>,
    stopping: bool,
    shutdown: bool,
}

impl TaskManager {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(Inner {
                tasks: HashMap::new(),
                queue: VecDeque::new(),
                current: None,
                child_pid: None,
                stopping: false,
                shutdown: false,
            }),
            notify: Notify::new(),
        }
    }

    async fn snapshot_locked(&self, inner: &Inner) -> TasksSnapshot {
        let queue = inner
            .queue
            .iter()
            .filter_map(|id| inner.tasks.get(id).cloned())
            .collect();
        let current = inner
            .current
            .as_ref()
            .and_then(|id| inner.tasks.get(id).cloned());
        let mut history: Vec<TaskInfo> = inner
            .tasks
            .values()
            .filter(|t| {
                !inner.queue.contains(&t.id) && inner.current.as_deref() != Some(t.id.as_str())
            })
            .filter(|t| {
                matches!(
                    t.status,
                    TaskStatus::Completed | TaskStatus::Failed | TaskStatus::Cancelled
                )
            })
            .cloned()
            .collect();
        history.sort_by_key(|t| t.finished_at.unwrap_or(0));
        history.reverse();
        history.truncate(MAX_HISTORY);
        TasksSnapshot {
            queue,
            current,
            history,
            stopping: inner.stopping,
        }
    }

    async fn broadcast_queue(app: &AppHandle, inner: &Inner) {
        runner::emit_queue_changed(
            app,
            &inner.queue.iter().cloned().collect::<Vec<_>>(),
            inner.current.as_deref(),
            inner.stopping,
        );
    }

    /// 调度主循环：串行执行队列中的任务
    pub async fn pump(self: Arc<Self>, app: AppHandle) {
        'pump: loop {
            // 取下一个任务（队首 + 当前空闲）
            let next = {
                let mut g = self.inner.lock().await;
                if g.shutdown {
                    return;
                }
                if g.current.is_some() {
                    None
                } else {
                    let id = g.queue.pop_front();
                    if let Some(id) = id {
                        g.current = Some(id.clone());
                        if let Some(t) = g.tasks.get_mut(&id) {
                            t.status = TaskStatus::Running;
                            t.started_at = Some(crate::settings::now_millis());
                        }
                        g.tasks.get(&id).cloned()
                    } else {
                        None
                    }
                }
            };

            let task = match next {
                Some(t) => t,
                None => {
                    self.notify.notified().await;
                    continue;
                }
            };

            // 通知前端：任务开始运行
            {
                let g = self.inner.lock().await;
                if let Some(t) = g.tasks.get(&task.id) {
                    runner::emit_task_event(&app, t);
                    Self::broadcast_queue(&app, &g).await;
                }
            }

            // 构建命令并启动进程
            let ffmpeg_path = runner::load_settings_ffmpeg_path(&app);
            let cmd = build_command(ffmpeg_path.as_deref(), &task.args).await;
            let (mut task_to_run, child) = match cmd {
                Ok(mut cmd) => match cmd.spawn() {
                    Ok(child) => {
                        let mut t = task.clone();
                        t.progress = model::TaskProgress::default();
                        (t, Some(child))
                    }
                    Err(e) => {
                        let mut t = task.clone();
                        t.status = TaskStatus::Failed;
                        t.error = Some(format!("无法启动 ffmpeg 进程: {e}"));
                        runner::emit_task_event(&app, &t);
                        self.finish_task(&app, &t.id, &t).await;
                        continue 'pump;
                    }
                },
                Err(e) => {
                    let mut t = task.clone();
                    t.status = TaskStatus::Failed;
                    t.error = Some(e);
                    runner::emit_task_event(&app, &t);
                    self.finish_task(&app, &t.id, &t).await;
                    continue 'pump;
                }
            };

            // 登记 PID；若 stop 恰好在 spawn 前后请求（stopping=true），立即击杀
            let child = match child {
                Some(c) => {
                    let pid = c.id();
                    let should_kill = {
                        let mut g = self.inner.lock().await;
                        if g.stopping {
                            g.stopping = false; // 本轮清场，finish_task 也会复位
                            true
                        } else {
                            g.child_pid = pid;
                            false
                        }
                    };
                    if should_kill {
                        if let Some(pid_val) = pid {
                            kill_tree(pid_val);
                        }
                    }
                    c
                }
                None => continue 'pump,
            };

            // 运行日志输出完整 ffmpeg 命令，便于排查（PRD：完整命令输出在运行日志窗口）
            {
                let mut cmdline = String::from("ffmpeg");
                for a in &task_to_run.args {
                    cmdline.push(' ');
                    cmdline.push_str(a);
                }
                runner::emit_log(&app, &task_to_run.id, &cmdline, "info");
            }
            let (code, err) = runner::run_task(&app, &mut task_to_run, child).await;

            // 判定最终状态
            let cancelled = {
                let g = self.inner.lock().await;
                g.stopping || matches!(task_to_run.status, TaskStatus::Cancelled)
            };
            let final_status = if cancelled {
                TaskStatus::Cancelled
            } else if code == 0 {
                TaskStatus::Completed
            } else {
                TaskStatus::Failed
            };
            let mut final_task = task_to_run;
            final_task.status = final_status;
            if let Some(e) = err {
                final_task.error = Some(e);
            }
            final_task.finished_at = Some(crate::settings::now_millis());
            runner::emit_task_event(&app, &final_task);

            self.finish_task(&app, &final_task.id, &final_task).await;
        }
    }

    async fn finish_task(&self, app: &AppHandle, id: &str, task: &TaskInfo) {
        let mut g = self.inner.lock().await;
        if g.current.as_deref() == Some(id) {
            g.current = None;
        }
        g.stopping = false;
        g.child_pid = None;
        g.tasks.insert(id.to_string(), task.clone());
        Self::broadcast_queue(app, &g).await;
        self.notify.notify_one();
    }

    /// 停止：运行中 → 杀进程树；排队中 → 取消出队
    pub async fn stop(&self, app: &AppHandle, id: &str) -> Result<(), String> {
        let mut g = self.inner.lock().await;

        if g.current.as_deref() == Some(id) {
            g.stopping = true;
            if let Some(t) = g.tasks.get_mut(id) {
                t.status = TaskStatus::Cancelled;
            }
            let pid = g.child_pid;
            Self::broadcast_queue(app, &g).await;
            drop(g);
            // 通过登记的 PID 击杀整个进程树（run_task 的 wait() 会立即返回收尾）
            if let Some(pid_val) = pid {
                kill_tree(pid_val);
            }
            // 若 PID 尚未登记（spawn 竞态窗口），pump 在 spawn 后会检查 stopping 自行击杀
            if let Some(t) = self.inner.lock().await.tasks.get(id) {
                runner::emit_task_event(app, t);
            }
            Ok(())
        } else {
            // 排队中：出队并标记取消
            if let Some(pos) = g.queue.iter().position(|x| x == id) {
                g.queue.remove(pos);
                if let Some(t) = g.tasks.get_mut(id) {
                    t.status = TaskStatus::Cancelled;
                    t.finished_at = Some(crate::settings::now_millis());
                }
                let t = g.tasks.get(id).cloned();
                Self::broadcast_queue(app, &g).await;
                if let Some(t) = t {
                    runner::emit_task_event(app, &t);
                }
                Ok(())
            } else if g.tasks.contains_key(id) {
                Ok(())
            } else {
                Err(format!("任务不存在: {id}"))
            }
        }
    }

    /// 删除任务：仅允许已结束或排队中的任务（运行中请先停止）
    pub async fn remove(&self, app: &AppHandle, id: &str) -> Result<(), String> {
        let mut g = self.inner.lock().await;
        if g.current.as_deref() == Some(id) {
            return Err("运行中的任务不能删除，请先停止".to_string());
        }
        if g.queue.iter().any(|x| x == id) {
            g.queue.retain(|x| x != id);
        }
        let removed = g.tasks.remove(id);
        if removed.is_some() {
            Self::broadcast_queue(app, &g).await;
        }
        Ok(())
    }

    /// 调整队列顺序
    pub async fn reorder(&self, app: &AppHandle, id: &str, direction: &str) -> Result<(), String> {
        let mut g = self.inner.lock().await;
        let pos = g
            .queue
            .iter()
            .position(|x| x == id)
            .ok_or_else(|| "任务不在队列中".to_string())?;
        let new_pos = match direction {
            "up" => pos.checked_sub(1),
            "down" => {
                if pos + 1 < g.queue.len() {
                    Some(pos + 1)
                } else {
                    None
                }
            }
            _ => return Err("无效方向".to_string()),
        };
        if let Some(np) = new_pos {
            let id_str = g.queue.remove(pos).unwrap();
            g.queue.insert(np, id_str);
            Self::broadcast_queue(app, &g).await;
        }
        Ok(())
    }

    /// 清空已结束任务
    pub async fn clear_finished(&self, app: &AppHandle) {
        let mut g = self.inner.lock().await;
        let finished_ids: Vec<String> = g
            .tasks
            .iter()
            .filter(|(id, t)| {
                !g.queue.contains(*id)
                    && g.current.as_deref() != Some(id.as_str())
                    && matches!(
                        t.status,
                        TaskStatus::Completed | TaskStatus::Failed | TaskStatus::Cancelled
                    )
            })
            .map(|(id, _)| id.clone())
            .collect();
        for id in finished_ids {
            g.tasks.remove(&id);
        }
        Self::broadcast_queue(app, &g).await;
    }

    pub async fn shutdown(&self) {
        let mut g = self.inner.lock().await;
        g.shutdown = true;
        let pid = g.child_pid;
        drop(g);
        if let Some(pid_val) = pid {
            kill_tree(pid_val);
        }
        self.notify.notify_one();
    }
}

// ---------------- IPC 命令 ----------------

#[tauri::command]
pub async fn task_add(
    app: AppHandle,
    state: State<'_, Arc<TaskManager>>,
    task: NewTask,
) -> Result<TaskInfo, String> {
    let name = if task.name.trim().is_empty() {
        task.output_path.clone()
    } else {
        task.name.clone()
    };
    let info = TaskInfo::new(
        uuid(),
        name,
        task.args,
        task.input_path,
        task.output_path,
        crate::settings::now_millis(),
    );
    let id = info.id.clone();
    {
        let mut g = state.inner.lock().await;
        g.queue.push_back(id.clone());
        g.tasks.insert(id.clone(), info.clone());
        TaskManager::broadcast_queue(&app, &g).await;
    }
    // 若当前空闲，唤醒调度循环立即开始
    let should_start = {
        let g = state.inner.lock().await;
        g.current.is_none()
    };
    if should_start {
        state.notify.notify_one();
    }
    Ok(info)
}

#[tauri::command]
pub async fn task_stop(
    app: AppHandle,
    state: State<'_, Arc<TaskManager>>,
    id: String,
) -> Result<(), String> {
    state.stop(&app, &id).await
}

#[tauri::command]
pub async fn task_remove(
    app: AppHandle,
    state: State<'_, Arc<TaskManager>>,
    id: String,
) -> Result<(), String> {
    state.remove(&app, &id).await
}

#[tauri::command]
pub async fn task_reorder(
    app: AppHandle,
    state: State<'_, Arc<TaskManager>>,
    id: String,
    direction: String,
) -> Result<(), String> {
    state.reorder(&app, &id, &direction).await
}

#[tauri::command]
pub async fn task_clear_finished(
    app: AppHandle,
    state: State<'_, Arc<TaskManager>>,
) -> Result<(), String> {
    state.clear_finished(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn tasks_snapshot(state: State<'_, Arc<TaskManager>>) -> Result<TasksSnapshot, String> {
    let g = state.inner.lock().await;
    Ok(state.snapshot_locked(&g).await)
}

fn uuid() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let ts = crate::settings::now_millis();
    format!("t{ts:x}{n:x}")
}
