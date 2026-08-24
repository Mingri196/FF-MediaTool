//! 单任务执行：spawn ffmpeg、非阻塞读 stdout/stderr、解析进度、收退出码。
//!
//! 与参考项目（Electron/PHP）的关键差异（对应 PRD 6.3 的要求）：
//! - 用 tokio 异步双管道读取，**stdout/stderr 各自独立任务消费**，不会因
//!   管道缓冲区写满而互相阻塞（参考项目存在日志读取死锁缺陷，这里从根上避免）
//! - 退出时先杀进程树（Windows `taskkill /T`，Unix 进程组），再 wait 回收，
//!   **不留僵尸进程/后台残留**
//! - 进度走 `-progress pipe:1` 机器可读通道，与人类日志分离，避免正则误判

use std::process::Stdio;
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::mpsc;

use crate::settings;
use crate::task::model::{TaskInfo, TaskProgress};
use crate::task::progress::ProgressParser;

/// 事件名：所有任务事件统一走这一个通道
pub const TASK_EVENT: &str = "task://event";

/// 单行日志级别推断（粗粒度，用于前端着色）
fn log_level(line: &str) -> &'static str {
    let l = line.to_lowercase();
    if l.contains("error")
        || l.contains("invalid")
        || l.contains("failed")
        || l.contains("no such file")
        || l.contains("not found")
    {
        "error"
    } else if l.contains("warning") || l.contains("deprecated") {
        "warn"
    } else {
        "info"
    }
}

/// 解析当前可执行文件路径（手动配置 > PATH）
pub async fn resolve_binary(manual: Option<&str>, name: &str) -> Option<String> {
    if let Some(p) = manual.filter(|p| !p.trim().is_empty()) {
        return Some(p.to_string());
    }
    which::which(name)
        .ok()
        .map(|p| p.to_string_lossy().to_string())
}

/// 任务开始前用 ffprobe 预取总时长（毫秒）；失败返回 0（前端走不确定进度）
async fn probe_duration_ms(ffprobe_bin: &str, input: &str) -> i64 {
    let out = tokio::time::timeout(
        Duration::from_secs(10),
        Command::new(ffprobe_bin)
            .args([
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                input,
            ])
            .output(),
    )
    .await;
    match out {
        Ok(Ok(o)) if o.status.success() => {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            s.parse::<f64>()
                .ok()
                .map(|d| (d * 1000.0) as i64)
                .unwrap_or(0)
        }
        _ => 0,
    }
}

/// 计算展示用进度（percent / eta）
/// `known_duration_ms`：任务开始前 ffprobe 预取的总时长（若 >0 则优先），
/// 避免被进度块的原始值覆盖（进度块里 duration 恒为 0）
fn compute_progress(raw: &TaskProgress, known_duration_ms: i64) -> TaskProgress {
    let mut p = raw.clone();
    let dur = if known_duration_ms > 0 {
        known_duration_ms
    } else {
        raw.duration_ms
    };
    p.duration_ms = dur;
    if dur > 0 {
        p.percent = ((p.time_ms as f64 / dur as f64) * 100.0).clamp(0.0, 100.0);
        if p.speed > 0.0 && p.time_ms < dur {
            let remain = (dur - p.time_ms) as f64;
            p.eta_ms = (remain / p.speed) as i64;
        }
    }
    p
}

/// 平台相关的进程组设置（杀树前置条件）
#[cfg(unix)]
fn spawn_with_group(cmd: &mut Command) {
    use std::os::unix::process::CommandExt;
    cmd.process_group(0);
}
#[cfg(windows)]
fn spawn_with_group(_cmd: &mut Command) {}

/// 杀掉进程树：Windows 用 taskkill /F /T（递归子进程），Unix 杀进程组
#[cfg(unix)]
pub fn kill_tree(pid: u32) {
    let _ = std::process::Command::new("kill")
        .args(["-TERM", &format!("-{pid}")])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    let _ = std::process::Command::new("kill")
        .args(["-KILL", &format!("-{pid}")])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}
#[cfg(windows)]
pub fn kill_tree(pid: u32) {
    // taskkill /F 强制、/T 同时终止子进程树 —— 杜绝后台残留 ffmpeg
    let _ = std::process::Command::new("taskkill")
        .args(["/F", "/T", "/PID", &pid.to_string()])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

/// 执行单个任务直到进程退出。
/// 返回 (退出码, 错误摘要)。退出码 0 视为成功，其余由调度器判定失败/取消。
pub async fn run_task(
    app: &AppHandle,
    task: &mut TaskInfo,
    mut child: Child,
) -> (i32, Option<String>) {
    let task_id = task.id.clone();

    // 预取总时长（失败返回 0，前端显示不确定进度）
    let ffprobe_bin = resolve_binary(None, "ffprobe")
        .await
        .unwrap_or_else(|| "ffprobe".to_string());
    let duration = probe_duration_ms(&ffprobe_bin, &task.input_path).await;
    if duration > 0 {
        task.progress.duration_ms = duration;
        emit_task(app, task);
    }

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let (progress_tx, mut progress_rx) = mpsc::channel::<TaskProgress>(64);
    let (log_tx, mut log_rx) = mpsc::channel::<(String, String)>(512);

    // ---- stdout：机器可读进度，独立任务消费 ----
    let stdout_task = tokio::spawn(async move {
        let mut parser = ProgressParser::new();
        if let Some(stream) = stdout {
            let mut reader = BufReader::new(stream);
            let mut buf = String::new();
            loop {
                buf.clear();
                match reader.read_line(&mut buf).await {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {
                        if let Some(p) = parser.feed_line(buf.trim_end()) {
                            let _ = progress_tx.send(p).await;
                        }
                    }
                }
            }
        }
        drop(progress_tx);
    });

    // ---- stderr：人类日志，独立任务消费（与 stdout 互不阻塞）----
    let stderr_task = tokio::spawn(async move {
        if let Some(stream) = stderr {
            let mut reader = BufReader::new(stream);
            let mut buf = String::new();
            loop {
                buf.clear();
                match reader.read_line(&mut buf).await {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {
                        let line = buf.trim_end().to_string();
                        let level = log_level(&line).to_string();
                        if log_tx.send((line, level)).await.is_err() {
                            break; // 接收端已关闭
                        }
                    }
                }
            }
        }
        drop(log_tx);
    });

    // ---- 主循环：合并进度 / 日志 / 进程退出 ----
    let mut stdout_done = false;
    let mut stderr_done = false;
    let exit_status = loop {
        tokio::select! {
            p = progress_rx.recv(), if !stdout_done => {
                match p {
                    Some(raw) => {
                        task.progress = compute_progress(&raw, task.progress.duration_ms);
                        emit_task(app, task);
                    }
                    None => { stdout_done = true; }
                }
            }
            l = log_rx.recv(), if !stderr_done => {
                match l {
                    Some((line, level)) => emit_log(app, &task_id, &line, &level),
                    None => { stderr_done = true; }
                }
            }
            exit = child.wait() => {
                break exit;
            }
        }
    };
    let _ = (stdout_done, stderr_done);

    // 收尾：等待两个读取任务结束（管道 EOF 后快速返回）
    let _ = tokio::time::timeout(Duration::from_secs(5), async {
        let _ = stdout_task.await;
        let _ = stderr_task.await;
    })
    .await;

    let code = exit_status.ok().and_then(|s| s.code()).unwrap_or(-1);
    let err = if code != 0 {
        // 若进程是被 kill 掉的（code None 或非 0），可能是用户停止；
        // 具体归类由调度器依据 stopping 标记决定，这里只给摘要
        Some(format!("ffmpeg 退出码 {code}"))
    } else {
        None
    };
    (code, err)
}

/// 组装 ffmpeg 命令（自动附加全局安全参数；顺序无影响，均为全局选项）
pub async fn build_command(
    settings_ffmpeg: Option<&str>,
    args: &[String],
) -> Result<Command, String> {
    let bin = resolve_binary(settings_ffmpeg, "ffmpeg")
        .await
        .ok_or_else(|| {
            "未找到 ffmpeg，请在「设置 → FFmpeg 环境」中配置可执行文件路径".to_string()
        })?;
    let mut cmd = Command::new(&bin);
    cmd.args(["-y", "-hide_banner", "-nostats"])
        .args(args)
        .arg("-progress")
        .arg("pipe:1") // 机器可读进度输出到 stdout
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    spawn_with_group(&mut cmd);
    Ok(cmd)
}

fn emit_task(app: &AppHandle, task: &TaskInfo) {
    let _ = app.emit(
        TASK_EVENT,
        serde_json::json!({ "type": "taskUpdated", "task": task }),
    );
}

fn emit_log(app: &AppHandle, task_id: &str, line: &str, level: &str) {
    let _ = app.emit(
        TASK_EVENT,
        serde_json::json!({
            "type": "log",
            "taskId": task_id,
            "line": line,
            "level": level,
        }),
    );
}

/// 供 manager 使用的公共发送函数
pub fn emit_queue_changed(
    app: &AppHandle,
    queue_ids: &[String],
    current: Option<&str>,
    stopping: bool,
) {
    let _ = app.emit(
        TASK_EVENT,
        serde_json::json!({
            "type": "queueChanged",
            "queue": queue_ids,
            "current": current,
            "stopping": stopping,
        }),
    );
}

/// 供 manager 使用
pub fn emit_task_event(app: &AppHandle, task: &TaskInfo) {
    emit_task(app, task);
}

/// 传递设置引用（manager 需要 settings 来解析 ffmpeg 路径）
pub fn load_settings_ffmpeg_path(app: &AppHandle) -> Option<String> {
    settings::load(app).ffmpeg_path
}
