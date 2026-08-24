//! 通用小工具命令（写文本文件等）

use std::path::Path;

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
    if !matches!(ext.as_str(), "txt" | "log" | "json" | "xml" | "csv" | "md") {
        return Err(format!(
            "不允许的扩展名: .{ext}（仅支持 txt/log/json/xml/csv/md）"
        ));
    }
    std::fs::write(&p, content).map_err(|e| format!("写入文件失败: {e}"))
}
