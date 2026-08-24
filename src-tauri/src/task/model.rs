//! 任务模型：与前端 src/tasks/types.ts 一一对应（camelCase）

use serde::{Deserialize, Serialize};

/// 任务状态
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Queued,
    Running,
    Completed,
    Failed,
    Cancelled,
}

/// 实时进度（-progress pipe:1 解析而来）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskProgress {
    /// 0..=100；未知（如取不到总时长）为 -1
    pub percent: f64,
    /// 已处理时长（毫秒）
    pub time_ms: i64,
    /// 总时长（毫秒，任务前用 ffprobe 预取）；未知为 0
    pub duration_ms: i64,
    /// 处理速度（倍速，如 1.23x）；未知为 0
    pub speed: f64,
    /// 剩余预估时间（毫秒）；未知为 -1
    pub eta_ms: i64,
}

impl Default for TaskProgress {
    fn default() -> Self {
        Self {
            percent: -1.0,
            time_ms: 0,
            duration_ms: 0,
            speed: 0.0,
            eta_ms: -1,
        }
    }
}

/// 单个任务的全量信息
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInfo {
    pub id: String,
    pub name: String,
    pub status: TaskStatus,
    /// 完整 ffmpeg 参数（不含可执行文件本身与自动附加的 -y/-progress 等）
    pub args: Vec<String>,
    pub input_path: String,
    pub output_path: String,
    pub created_at: i64,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
    pub progress: TaskProgress,
    /// 失败/取消时的错误摘要
    pub error: Option<String>,
}

impl TaskInfo {
    pub fn new(
        id: String,
        name: String,
        args: Vec<String>,
        input_path: String,
        output_path: String,
        created_at: i64,
    ) -> Self {
        Self {
            id,
            name,
            status: TaskStatus::Queued,
            args,
            input_path,
            output_path,
            created_at,
            started_at: None,
            finished_at: None,
            progress: TaskProgress::default(),
            error: None,
        }
    }
}

/// 入队请求（前端 → 后端）
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewTask {
    pub name: String,
    pub args: Vec<String>,
    pub input_path: String,
    pub output_path: String,
}

/// 队列快照（前端一次性拉取全量状态）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TasksSnapshot {
    /// 排队中的任务（按顺序）
    pub queue: Vec<TaskInfo>,
    /// 当前运行的任务（若有）
    pub current: Option<TaskInfo>,
    /// 最近结束的任务（完成/失败/取消，用于历史展示，最多保留 20 条）
    pub history: Vec<TaskInfo>,
    /// 是否正在停止（kill 过程中）
    pub stopping: bool,
}
