//! 通用小工具命令：写文本文件、文件存在检查、任务参数校验。

use std::path::Path;

use serde::Serialize;

/// 写文本文件（日志导出、报告导出等）。
/// 仅允许常见文本扩展名，防止被滥用写成任意二进制。
#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    let p = Path::new(&path);
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if !["txt", "log", "json", "xml", "csv", "md", "html", "srt", "ass", "vtt"].contains(&ext.as_str()) {
        return Err(format!("不允许写入 .{ext} 文件"));
    }
    std::fs::write(p, &content).map_err(|e| format!("写入文件失败: {e}"))
}

/// 检查输出文件是否存在
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputFileCheck {
    pub exists: bool,
    pub size: u64,
    pub modified: String,
}

#[tauri::command]
pub fn check_output_file(path: String) -> OutputFileCheck {
    let p = Path::new(&path);
    if p.exists() {
        if let Ok(meta) = p.metadata() {
            let modified = meta
                .modified()
                .ok()
                .map(|t| {
                    let dur = t
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default();
                    let secs = dur.as_secs();
                    format!("{}", secs)
                })
                .unwrap_or_default();
            return OutputFileCheck {
                exists: true,
                size: meta.len(),
                modified,
            };
        }
    }
    OutputFileCheck {
        exists: false,
        size: 0,
        modified: String::new(),
    }
}

/// 参数校验结果
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResult {
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

/// 任务参数校验：检查输入文件存在、输出路径可行、编码器基本正确、
/// 流复制模式下滤镜参数警告。
#[tauri::command]
pub fn validate_task_args(input: String, output: String, vcodec: Option<String>, acodec: Option<String>,
    has_vf: bool, has_af: bool) -> ValidationResult {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    // 输入文件
    if !Path::new(&input).exists() {
        errors.push(format!("输入文件不存在: {input}"));
    }
    // 输出路径
    if let Some(parent) = Path::new(&output).parent() {
        if !parent.exists() {
            errors.push(format!("输出目录不存在: {}", parent.display()));
        }
    }
    // 流复制 + 滤镜警告
    if let Some(ref vc) = vcodec {
        if vc == "copy" && has_vf {
            warnings.push("流复制 (copy) 模式已设置视频滤镜 (-vf)，滤镜将被忽略".to_string());
        }
    }
    if let Some(ref ac) = acodec {
        if ac == "copy" && has_af {
            warnings.push("流复制 (copy) 模式已设置音频滤镜 (-af)，滤镜将被忽略".to_string());
        }
    }

    ValidationResult { errors, warnings }
}