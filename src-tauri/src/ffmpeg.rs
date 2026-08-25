//! FFmpeg / FFprobe 环境检测与校验。
//! 逻辑：优先使用设置中手动指定的路径（绿色版），否则从系统 PATH 解析。
//! 用 tokio 异步子进程执行 `-version`，带超时，防止异常二进制卡死。

use std::time::Duration;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use serde::Serialize;
use tauri::AppHandle;
use tokio::process::Command;
use tokio::time::timeout;

use crate::settings;

const VERSION_TIMEOUT: Duration = Duration::from_secs(15);

/// 创建静默运行的 Command（Windows 下隐藏 CMD 窗口）
pub fn silent_cmd(program: &str) -> Command {
    #[cfg(target_os = "windows")]
    {
        let mut std_cmd = std::process::Command::new(program);
        std_cmd.creation_flags(0x08000000);
        return Command::from(std_cmd);
    }
    #[cfg(not(target_os = "windows"))]
    {
        Command::new(program)
    }
}

/// 单个二进制的检测结果
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BinaryInfo {
    /// 可执行文件绝对路径
    pub path: String,
    /// 版本字符串（如 "6.1.1-essentials_build-www.gyan.dev"）
    pub version: String,
    /// "path" = 来自系统 PATH；"manual" = 用户手动指定
    pub source: String,
}

/// FFmpeg 环境整体状态
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FfmpegStatus {
    pub ffmpeg: Option<BinaryInfo>,
    pub ffprobe: Option<BinaryInfo>,
    /// 是否配置了但校验失败（手动路径无效）——前端可据此提示"路径无效"而非"未安装"
    pub manual_invalid: bool,
}

/// 从 `-version` 输出第一行提取版本号，如
/// `ffmpeg version 6.1.1-essentials_build-www.gyan.dev Copyright ...` → `6.1.1-essentials_build-www.gyan.dev`
fn parse_version(first_line: &str) -> Option<String> {
    let line = first_line.trim();
    let idx = line.find("version")?;
    let rest = line[idx + "version".len()..].trim_start();
    let token = rest.split_whitespace().next()?;
    Some(token.to_string())
}

/// 运行 `<bin> -version` 并解析版本；返回 (完整首行, 版本号)
async fn probe_binary(bin_path: &str, bin_name: &str) -> Option<(String, String)> {
    let result = timeout(
        VERSION_TIMEOUT,
        silent_cmd(bin_path).args(["-version"]).output(),
    )
    .await;
    let out = match result {
        Ok(Ok(o)) if o.status.success() => o,
        _ => return None,
    };
    let stdout = String::from_utf8_lossy(&out.stdout);
    let first_line = stdout.lines().next().unwrap_or("").to_string();
    let version = parse_version(&first_line).unwrap_or_else(|| {
        // 兜底：取首行做版本展示
        if first_line.is_empty() {
            bin_name.to_string()
        } else {
            first_line.clone()
        }
    });
    Some((first_line, version))
}

/// 组装最终状态（清楚直接地做一次映射）
fn status_of(
    manual_ffmpeg: Option<String>,
    ffmpeg_r: Option<(String, String)>,
    manual_ffprobe: Option<String>,
    ffprobe_r: Option<(String, String)>,
) -> FfmpegStatus {
    let fm = {
        let manual = manual_ffmpeg.as_ref().filter(|p| !p.trim().is_empty());
        match (&ffmpeg_r, manual) {
            (Some((_, version)), Some(m)) => Some(BinaryInfo {
                path: m.clone(),
                version: version.clone(),
                source: "manual".into(),
            }),
            (Some((_, version)), None) => {
                let p = which::which("ffmpeg")
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|_| "ffmpeg".into());
                Some(BinaryInfo {
                    path: p,
                    version: version.clone(),
                    source: "path".into(),
                })
            }
            (None, _) => None,
        }
    };
    let fp = {
        let manual = manual_ffprobe.as_ref().filter(|p| !p.trim().is_empty());
        match (&ffprobe_r, manual) {
            (Some((_, version)), Some(m)) => Some(BinaryInfo {
                path: m.clone(),
                version: version.clone(),
                source: "manual".into(),
            }),
            (Some((_, version)), None) => {
                let p = which::which("ffprobe")
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|_| "ffprobe".into());
                Some(BinaryInfo {
                    path: p,
                    version: version.clone(),
                    source: "path".into(),
                })
            }
            (None, _) => None,
        }
    };
    let manual_invalid = (manual_ffmpeg.is_some_and(|m| !m.trim().is_empty()) && fm.is_none())
        || (manual_ffprobe.is_some_and(|m| !m.trim().is_empty()) && fp.is_none());
    FfmpegStatus {
        ffmpeg: fm,
        ffprobe: fp,
        manual_invalid,
    }
}

/// 执行检测：读设置 → 对 ffmpeg 与 ffprobe 分别探测（手动路径优先，否则 PATH）
async fn detect(app: &AppHandle) -> FfmpegStatus {
    let settings = settings::load(app);
    let manual_ffmpeg = settings.ffmpeg_path.clone();
    let manual_ffprobe = settings.ffprobe_path.clone();

    // 两个探测任务并行执行
    let (ffmpeg_r, ffprobe_r) = tokio::join!(
        async {
            match manual_ffmpeg.as_ref().filter(|p| !p.trim().is_empty()) {
                Some(p) => probe_binary(p, "ffmpeg").await,
                None => match which::which("ffmpeg") {
                    Ok(p) => probe_binary(&p.to_string_lossy(), "ffmpeg").await,
                    Err(_) => None,
                },
            }
        },
        async {
            match manual_ffprobe.as_ref().filter(|p| !p.trim().is_empty()) {
                Some(p) => probe_binary(p, "ffprobe").await,
                None => match which::which("ffprobe") {
                    Ok(p) => probe_binary(&p.to_string_lossy(), "ffprobe").await,
                    Err(_) => None,
                },
            }
        }
    );

    status_of(manual_ffmpeg, ffmpeg_r, manual_ffprobe, ffprobe_r)
}

/// 当前环境检测（前端启动时 + 设置页点击"重新检测"时调用）
#[tauri::command]
pub async fn detect_ffmpeg(app: AppHandle) -> FfmpegStatus {
    detect(&app).await
}

/// 校验一组手动指定的路径（不写入设置，仅供设置页"验证"按钮使用）
#[tauri::command]
pub async fn validate_ffmpeg_paths(
    ffmpeg_path: Option<String>,
    ffprobe_path: Option<String>,
) -> FfmpegStatus {
    let ffmpeg_r = match ffmpeg_path.as_ref().filter(|p| !p.trim().is_empty()) {
        Some(p) => probe_binary(p, "ffmpeg").await,
        None => None,
    };
    let ffprobe_r = match ffprobe_path.as_ref().filter(|p| !p.trim().is_empty()) {
        Some(p) => probe_binary(p, "ffprobe").await,
        None => None,
    };
    status_of(ffmpeg_path, ffmpeg_r, ffprobe_path, ffprobe_r)
}
