//! 媒体基础探测 + 全量元数据信息（模块五：FFprobe 深度读取媒体文件元数据）
//!
//! 模块三已有 media_probe_basic（时长/流概要）和 detect_crop（去黑边），
//! 模块五增加 media_probe_full（全量 FFprobe JSON 解析，与 PRD 5.1-5.4 对应）。

use std::collections::HashMap;
use std::time::Duration;

use serde::Serialize;
use tauri::AppHandle;
use tokio::process::Command;

use crate::settings;
use crate::task::runner::resolve_binary;

// ========== 模块三：基础探测 ==========

/// 单个流的概要信息（模块三，保留）
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

/// 媒体基础信息（模块三，保留）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaBasicInfo {
    pub duration_ms: i64,
    pub has_video: bool,
    pub has_audio: bool,
    pub streams: Vec<StreamSummary>,
    pub ok: bool,
    pub error: Option<String>,
}

/// 去黑边检测结果（模块三，保留）
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
            if codec_type == "video" { has_video = true; }
            if codec_type == "audio" { has_audio = true; }
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
#[tauri::command]
pub async fn detect_crop(app: AppHandle, path: String) -> Result<CropDetect, String> {
    let ffmpeg = resolve_binary(settings::load(&app).ffmpeg_path.as_deref(), "ffmpeg")
        .await
        .ok_or_else(|| "未找到 ffmpeg，请在设置页配置 FFmpeg 环境".to_string())?;
    let out = tokio::time::timeout(
        Duration::from_secs(30),
        Command::new(&ffmpeg)
            .args(["-v", "info", "-ss", "1", "-t", "2", "-i", &path, "-vf", "cropdetect=limit=24:round=2:reset=0", "-f", "null", "-"])
            .output(),
    )
    .await
    .map_err(|_| "去黑边检测超时（30 秒）".to_string())?
    .map_err(|e| format!("ffmpeg 执行失败: {e}"))?;
    let stderr = String::from_utf8_lossy(&out.stderr);
    let mut last: Option<CropDetect> = None;
    for line in stderr.lines() {
        if let Some(idx) = line.find("crop=") {
            let rest = &line[idx + 5..];
            let parts: Vec<&str> = rest.split_whitespace().next().unwrap_or("").split(':').collect();
            if parts.len() == 4 {
                if let (Ok(w), Ok(h), Ok(x), Ok(y)) = (parts[0].parse(), parts[1].parse(), parts[2].parse(), parts[3].parse()) {
                    last = Some(CropDetect { w, h, x, y });
                }
            }
        }
    }
    last.ok_or_else(|| {
        let head = stderr.lines().rev().take(5).collect::<Vec<_>>().join("\n");
        if head.trim().is_empty() { "未检测到黑边内容".to_string() } else { format!("无法解析裁剪检测结果:\n{head}") }
    })
}

// ========== 模块五：全量 FFprobe 信息 ==========

/// 容器信息
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatInfo {
    pub filename: String,
    pub format_name: String,
    pub format_long_name: String,
    pub duration: f64,
    pub size: i64,
    pub bit_rate: Option<i64>,
    pub start_time: f64,
    pub nb_streams: i64,
}

/// 视频流详细信息
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoStreamInfo {
    pub index: i64, pub codec_name: String, pub codec_long_name: String, pub profile: String, pub level: i64,
    pub width: i64, pub height: i64, pub coded_width: i64, pub coded_height: i64, pub pix_fmt: String,
    pub color_space: String, pub color_primaries: String, pub color_transfer: String, pub chroma_location: String,
    pub field_order: String, pub has_b_frames: i64, pub sample_aspect_ratio: String, pub display_aspect_ratio: String,
    pub r_frame_rate: String, pub avg_frame_rate: String, pub bit_rate: Option<i64>, pub bits_per_raw_sample: Option<i64>,
    pub refs: i64, pub nb_frames: Option<i64>, pub duration: f64, pub tags: HashMap<String, String>,
}

/// 音频流详细信息
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioStreamInfo {
    pub index: i64, pub codec_name: String, pub codec_long_name: String, pub profile: String,
    pub sample_fmt: String, pub sample_rate: i64, pub channels: i64, pub channel_layout: String,
    pub bit_rate: Option<i64>, pub max_bit_rate: Option<i64>, pub bits_per_sample: i64,
    pub duration: f64, pub nb_frames: Option<i64>, pub tags: HashMap<String, String>,
}

/// 全量媒体信息（PRD 5.1-5.3）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaFullInfo {
    pub ok: bool, pub error: Option<String>,
    pub format: FormatInfo, pub video_streams: Vec<VideoStreamInfo>, pub audio_streams: Vec<AudioStreamInfo>,
    pub metadata: HashMap<String, String>,
}

/// 全量 FFprobe 探测（PRD 模块五）
#[tauri::command]
pub async fn media_probe_full(app: AppHandle, path: String) -> MediaFullInfo {
    let ffprobe = match resolve_binary(settings::load(&app).ffprobe_path.as_deref(), "ffprobe").await {
        Some(b) => b, None => return error_result("未找到 ffprobe"),
    };
    let out = match Command::new(&ffprobe).args(["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", "-show_chapters", &path]).output().await {
        Ok(o) => o, Err(e) => return error_result(&format!("ffprobe 执行失败: {e}")),
    };
    if !out.status.success() { return error_result(&String::from_utf8_lossy(&out.stderr).trim()); }
    let text = String::from_utf8_lossy(&out.stdout);
    let json: serde_json::Value = match serde_json::from_str(&text) {
        Ok(v) => v, Err(e) => return error_result(&format!("解析 ffprobe 输出失败: {e}")),
    };
    let fmt = &json["format"];
    let format_info = FormatInfo {
        filename: fmt["filename"].as_str().unwrap_or("").to_string(),
        format_name: fmt["format_name"].as_str().unwrap_or("").to_string(),
        format_long_name: fmt["format_long_name"].as_str().unwrap_or("").to_string(),
        duration: fmt["duration"].as_str().and_then(|s| s.parse().ok()).unwrap_or(0.0),
        size: fmt["size"].as_str().and_then(|s| s.parse().ok()).unwrap_or(0),
        bit_rate: fmt["bit_rate"].as_str().and_then(|s| s.parse().ok()),
        start_time: fmt["start_time"].as_str().and_then(|s| s.parse().ok()).unwrap_or(0.0),
        nb_streams: fmt["nb_streams"].as_str().and_then(|s| s.parse().ok()).unwrap_or(0),
    };
    let mut metadata = HashMap::new();
    if let Some(tags) = fmt["tags"].as_object() { for (k, v) in tags { if let Some(val) = v.as_str() { metadata.insert(k.clone(), val.to_string()); } } }
    let mut video_streams = Vec::new();
    let mut audio_streams = Vec::new();
    if let Some(arr) = json["streams"].as_array() {
        for s in arr {
            let codec_type = s["codec_type"].as_str().unwrap_or("");
            let mut tags = HashMap::new();
            if let Some(t) = s["tags"].as_object() { for (k, v) in t { if let Some(val) = v.as_str() { tags.insert(k.clone(), val.to_string()); } } }
            if codec_type == "video" {
                video_streams.push(VideoStreamInfo {
                    index: s["index"].as_i64().unwrap_or(0), codec_name: s["codec_name"].as_str().unwrap_or("").to_string(),
                    codec_long_name: s["codec_long_name"].as_str().unwrap_or("").to_string(), profile: s["profile"].as_str().unwrap_or("").to_string(),
                    level: s["level"].as_i64().unwrap_or(0), width: s["width"].as_i64().unwrap_or(0), height: s["height"].as_i64().unwrap_or(0),
                    coded_width: s["coded_width"].as_i64().unwrap_or(0), coded_height: s["coded_height"].as_i64().unwrap_or(0),
                    pix_fmt: s["pix_fmt"].as_str().unwrap_or("").to_string(), color_space: s["color_space"].as_str().unwrap_or("").to_string(),
                    color_primaries: s["color_primaries"].as_str().unwrap_or("").to_string(), color_transfer: s["color_transfer"].as_str().unwrap_or("").to_string(),
                    chroma_location: s["chroma_location"].as_str().unwrap_or("").to_string(), field_order: s["field_order"].as_str().unwrap_or("").to_string(),
                    has_b_frames: s["has_b_frames"].as_i64().unwrap_or(0), sample_aspect_ratio: s["sample_aspect_ratio"].as_str().unwrap_or("").to_string(),
                    display_aspect_ratio: s["display_aspect_ratio"].as_str().unwrap_or("").to_string(), r_frame_rate: s["r_frame_rate"].as_str().unwrap_or("").to_string(),
                    avg_frame_rate: s["avg_frame_rate"].as_str().unwrap_or("").to_string(), bit_rate: s["bit_rate"].as_str().and_then(|v| v.parse().ok()),
                    bits_per_raw_sample: s["bits_per_raw_sample"].as_i64(), refs: s["refs"].as_i64().unwrap_or(0),
                    nb_frames: s["nb_frames"].as_str().and_then(|v| v.parse().ok()), duration: s["duration"].as_str().and_then(|v| v.parse().ok()).unwrap_or(0.0),
                    tags,
                });
            } else if codec_type == "audio" {
                audio_streams.push(AudioStreamInfo {
                    index: s["index"].as_i64().unwrap_or(0), codec_name: s["codec_name"].as_str().unwrap_or("").to_string(),
                    codec_long_name: s["codec_long_name"].as_str().unwrap_or("").to_string(), profile: s["profile"].as_str().unwrap_or("").to_string(),
                    sample_fmt: s["sample_fmt"].as_str().unwrap_or("").to_string(), sample_rate: s["sample_rate"].as_str().and_then(|v| v.parse().ok()).unwrap_or(0),
                    channels: s["channels"].as_i64().unwrap_or(0), channel_layout: s["channel_layout"].as_str().unwrap_or("").to_string(),
                    bit_rate: s["bit_rate"].as_str().and_then(|v| v.parse().ok()), max_bit_rate: s["max_bit_rate"].as_str().and_then(|v| v.parse().ok()),
                    bits_per_sample: s["bits_per_sample"].as_i64().unwrap_or(0), duration: s["duration"].as_str().and_then(|v| v.parse().ok()).unwrap_or(0.0),
                    nb_frames: s["nb_frames"].as_str().and_then(|v| v.parse().ok()), tags,
                });
            }
        }
    }
    MediaFullInfo { ok: true, error: None, format: format_info, video_streams, audio_streams, metadata }
}

fn error_result(msg: &str) -> MediaFullInfo {
    MediaFullInfo { ok: false, error: Some(msg.to_string()), format: empty_format(), video_streams: vec![], audio_streams: vec![], metadata: HashMap::new() }
}

fn empty_format() -> FormatInfo {
    FormatInfo { filename: String::new(), format_name: String::new(), format_long_name: String::new(), duration: 0.0, size: 0, bit_rate: None, start_time: 0.0, nb_streams: 0 }
}

const IMAGE_EXTS: &[&str] = &["jpg", "jpeg", "png", "webp", "bmp", "gif", "tiff", "tif", "ico", "avif"];

#[tauri::command]
pub fn scan_directory(path: String) -> Result<Vec<String>, String> {
    let mut results = Vec::new();
    let dir = std::path::Path::new(&path);
    if !dir.is_dir() {
        return Err("路径不是文件夹".to_string());
    }
    scan_dir_recursive(dir, &mut results).map_err(|e| format!("扫描失败: {e}"))?;
    Ok(results)
}

fn scan_dir_recursive(dir: &std::path::Path, results: &mut Vec<String>) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            scan_dir_recursive(&path, results)?;
        } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            if IMAGE_EXTS.contains(&ext.to_lowercase().as_str()) {
                results.push(path.to_string_lossy().to_string());
            }
        }
    }
    Ok(())
}