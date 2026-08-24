//! 媒体基础探测：为转换/剪辑页提供时长、流结构信息，以及去黑边自动裁剪检测。
//! 模块五会基于 ffprobe 做完整的媒体信息展示，这里只取任务流程所需的最小集合。

use std::time::Duration;

use serde::Serialize;
use tauri::AppHandle;
use tokio::process::Command;

use crate::settings;
use crate::task::runner::resolve_binary;

/// 单个流的概要信息（模块五做全量，这里取 UI 需要的最小字段）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamSummary {
    pub index: i64,
    pub codec_type: String,
    pub codec_name: String,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub sample_rate: Option<i64>,
    pub channels: Option<i64>,
}

/// 媒体基础信息
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaBasicInfo {
    pub duration_ms: i64,
    pub has_video: bool,
    pub has_audio: bool,
    pub streams: Vec<StreamSummary>,
    /// 是否读取成功（文件不存在/损坏时 false）
    pub ok: bool,
    pub error: Option<String>,
}

/// 去黑边检测结果（cropdetect 滤镜输出）
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CropDetect {
    pub w: i64,
    pub h: i64,
    pub x: i64,
    pub y: i64,
}

async fn probe(app: &AppHandle, input: &str) -> Result<std::process::Output, String> {
    let ffprobe = resolve_binary(settings::load(app).ffprobe_path.as_deref(), "ffprobe")
        .await
        .ok_or_else(|| "未找到 ffprobe，请在设置页配置 FFmpeg 环境".to_string())?;
    Command::new(&ffprobe)
        .args([
            "-v", "error",
            "-show_entries",
            "format=duration:stream=index,codec_type,codec_name,width,height,sample_rate,channels",
            "-of", "json",
            input,
        ])
        .output()
        .await
        .map_err(|e| format!("ffprobe 执行失败: {e}"))
}

/// 读取媒体基础信息（时长 + 流列表）
#[tauri::command]
pub async fn media_probe_basic(app: AppHandle, path: String) -> MediaBasicInfo {
    let out = match probe(&app, &path).await {
        Ok(o) => o,
        Err(e) => {
            return MediaBasicInfo {
                duration_ms: 0,
                has_video: false,
                has_audio: false,
                streams: vec![],
                ok: false,
                error: Some(e),
            };
        }
    };
    if !out.status.success() {
        return MediaBasicInfo {
            duration_ms: 0,
            has_video: false,
            has_audio: false,
            streams: vec![],
            ok: false,
            error: Some(String::from_utf8_lossy(&out.stderr).trim().to_string()),
        };
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let json: serde_json::Value = serde_json::from_str(&text).unwrap_or(serde_json::Value::Null);
    let format_dur = json["format"]["duration"].as_str().unwrap_or("0").parse::<f64>().unwrap_or(0.0);
    let mut streams = vec![];
    let mut has_video = false;
    let mut has_audio = false;
    if let Some(arr) = json["streams"].as_array() {
        for s in arr {
            let codec_type = s["codec_type"].as_str().unwrap_or("").to_string();
            if codec_type == "video" {
                has_video = true;
            }
            if codec_type == "audio" {
                has_audio = true;
            }
            streams.push(StreamSummary {
                index: s["index"].as_i64().unwrap_or(0),
                codec_type,
                codec_name: s["codec_name"].as_str().unwrap_or("").to_string(),
                width: s["width"].as_i64(),
                height: s["height"].as_i64(),
                sample_rate: s["sample_rate"].as_str().and_then(|r| r.parse().ok()),
                channels: s["channels"].as_i64(),
            });
        }
    }
    MediaBasicInfo {
        duration_ms: (format_dur * 1000.0) as i64,
        has_video,
        has_audio,
        streams,
        ok: true,
        error: None,
    }
}

/// 去黑边检测：跑 1～2 秒的 cropdetect，返回首次稳定检测到的裁剪参数。
/// 解析 `-vf cropdetect=...` 输出中的 `crop=W:H:X:Y` 行（取最后一次）。
#[tauri::command]
pub async fn detect_crop(app: AppHandle, path: String) -> Result<CropDetect, String> {
    let ffmpeg = resolve_binary(settings::load(&app).ffmpeg_path.as_deref(), "ffmpeg")
        .await
        .ok_or_else(|| "未找到 ffmpeg，请在设置页配置 FFmpeg 环境".to_string())?;
    let out = tokio::time::timeout(
        Duration::from_secs(30),
        Command::new(&ffmpeg)
            .args([
                "-v", "info",
                "-ss", "1",
                "-t", "2",
                "-i", &path,
                "-vf", "cropdetect=limit=24:round=2:reset=0",
                "-f", "null", "-",
            ])
            .output(),
    )
    .await
    .map_err(|_| "去黑边检测超时（30 秒）".to_string())?
    .map_err(|e| format!("ffmpeg 执行失败: {e}"))?;
    let stderr = String::from_utf8_lossy(&out.stderr);
    // cropdetect 输出形如: [Parsed_cropdetect_0 @ ...] x1:0 x2:1279 y1:0 y2:719 w:1280 h:720 x:0 y:0 pts:... crop=1280:720:0:0
    let mut last: Option<CropDetect> = None;
    for line in stderr.lines() {
        if let Some(idx) = line.find("crop=") {
            let rest = &line[idx + 5..];
            let nums: Vec<i64> = rest
                .split(|c: char| !c.is_ascii_digit() && c != '-')
                .filter(|s| !s.is_empty())
                .filter_map(|s| s.parse().ok())
                .collect();
            if nums.len() >= 4 {
                last = Some(CropDetect {
                    w: nums[0],
                    h: nums[1],
                    x: nums[2],
                    y: nums[3],
                });
            } else if let Some(part) = rest.split_whitespace().next() {
                let parts: Vec<&str> = part.split(':').collect();
                if parts.len() == 4 {
                    if let (Ok(w), Ok(h), Ok(x), Ok(y)) = (
                        parts[0].parse(),
                        parts[1].parse(),
                        parts[2].parse(),
                        parts[3].parse(),
                    ) {
                        last = Some(CropDetect { w, h, x, y });
                    }
                }
            }
        }
    }
    last.ok_or_else(|| {
        let head: String = stderr
            .lines()
            .rev()
            .take(5)
            .collect::<Vec<_>>()
            .join("\n");
        if head.trim().is_empty() {
            "未检测到黑边内容（文件可能是纯视频流？）".to_string()
        } else {
            format!("无法解析裁剪检测结果:\n{head}")
        }
    })
}