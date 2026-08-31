//! 自定义背景素材管理：软件根目录（resource_dir）下的 `Background` 文件夹。
//! 导入时把外部文件**复制**进该目录（绝不移动/删除用户原始文件），
//! 图库扫描、删除也只作用于该目录。
//!
//! 纯逻辑函数接收 base 目录参数，便于单元测试；tauri command 薄封装传入 resource_dir。

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::Manager;

/// 支持的背景素材扩展名（小写）
pub const BG_EXTS: [&str; 6] = ["png", "jpg", "jpeg", "webp", "mp4", "webm"];

/// 图库条目：文件名 + 绝对路径（前端 convertFileSrc 加载预览）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundFile {
    pub name: String,
    pub path: String,
}

/// 软件根目录下的 Background 文件夹路径
pub fn bg_dir_path(base: &Path) -> PathBuf {
    base.join("Background")
}

/// 确保 Background 目录存在，返回其路径
pub fn ensure_bg_dir(base: &Path) -> Result<PathBuf, String> {
    let dir = bg_dir_path(base);
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建 Background 目录: {e}"))?;
    Ok(dir)
}

/// 扩展名是否受支持（不区分大小写）
pub fn is_supported(name: &str) -> bool {
    let ext = name
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    BG_EXTS.contains(&ext.as_str())
}

/// 取文件名主干（去掉扩展名），用于重名去重
fn stem_of(name: &str) -> (&str, &str) {
    match name.rfind('.') {
        Some(i) => (&name[..i], &name[i + 1..]),
        None => (name, ""),
    }
}

/// 把外部文件复制进 Background 目录。重名时追加 ` (n)` 序号，避免覆盖。
/// 返回落盘后的文件名（配置里保存的就是这个，不保存外部路径）。
pub fn import_file(base: &Path, src: &str) -> Result<String, String> {
    let src_path = Path::new(src);
    let file_name = src_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("无法识别文件名: {src}"))?;
    if !is_supported(file_name) {
        return Err(format!(
            "不支持的背景格式: {file_name}（支持 png/jpg/jpeg/webp/mp4/webm）"
        ));
    }
    let dir = ensure_bg_dir(base)?;

    // 重名去重：foo.png → foo (1).png → foo (2).png …
    let (stem, ext) = stem_of(file_name);
    let mut dest_name = file_name.to_string();
    let mut n = 1usize;
    while dir.join(&dest_name).exists() {
        dest_name = if ext.is_empty() {
            format!("{stem} ({n})")
        } else {
            format!("{stem} ({n}).{ext}")
        };
        n += 1;
    }

    let dest = dir.join(&dest_name);
    fs::copy(src_path, &dest).map_err(|e| format!("复制背景文件失败: {e}"))?;
    Ok(dest_name)
}

/// 扫描 Background 目录，只返回支持的格式；目录不存在时返回空列表。
pub fn list_files(base: &Path) -> Result<Vec<BackgroundFile>, String> {
    let dir = bg_dir_path(base);
    let mut out = Vec::new();
    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return Ok(out), // 目录不存在 → 空图库
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if !p.is_file() {
            continue;
        }
        let Some(name) = p.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !is_supported(name) {
            continue; // 过滤非 png/jpg/jpeg/webp/mp4/webm
        }
        out.push(BackgroundFile {
            name: name.to_string(),
            path: p.to_string_lossy().to_string(),
        });
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

/// 删除 Background 目录内的素材。仅接受纯文件名（防路径穿越），
/// 且只能删该目录下真实存在的文件。
pub fn delete_file(base: &Path, name: &str) -> Result<(), String> {
    if name.contains('/') || name.contains('\\') || name == "." || name == ".." {
        return Err("非法文件名".into());
    }
    let dir = ensure_bg_dir(base)?;
    let target = dir.join(name);
    // 双保险：解析真实路径后必须仍位于 Background 目录内
    let canon_target = fs::canonicalize(&target).map_err(|_| format!("文件不存在: {name}"))?;
    let canon_dir = fs::canonicalize(&dir).map_err(|e| format!("Background 目录不可访问: {e}"))?;
    if !canon_target.starts_with(&canon_dir) {
        return Err("拒绝删除目录外文件".into());
    }
    fs::remove_file(&canon_target).map_err(|e| format!("删除失败: {e}"))?;
    Ok(())
}

fn resource_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .resource_dir()
        .map_err(|e| format!("无法获取资源目录: {e}"))
}

/// 返回 Background 目录的绝对路径（便于排查）
#[tauri::command]
pub fn background_get_dir(app: tauri::AppHandle) -> Result<String, String> {
    ensure_bg_dir(&resource_dir(&app)?).map(|p| p.to_string_lossy().to_string())
}

/// 导入背景素材：复制外部文件到 Background 目录，返回内部文件名
#[tauri::command]
pub fn background_import(app: tauri::AppHandle, path: String) -> Result<String, String> {
    import_file(&resource_dir(&app)?, &path)
}

/// 列出图库全部素材（仅支持格式，含绝对路径供预览）
#[tauri::command]
pub fn background_list(app: tauri::AppHandle) -> Result<Vec<BackgroundFile>, String> {
    list_files(&resource_dir(&app)?)
}

/// 从图库删除素材文件
#[tauri::command]
pub fn background_delete(app: tauri::AppHandle, name: String) -> Result<(), String> {
    delete_file(&resource_dir(&app)?, &name)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_base(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "ffmt-bg-test-{tag}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn import_copies_and_persists_without_touching_source() {
        let base = tmp_base("import");
        let src_dir = base.join("src");
        fs::create_dir_all(&src_dir).unwrap();
        let src = src_dir.join("wall.png");
        fs::write(&src, b"png-data").unwrap();

        let name = import_file(&base, src.to_str().unwrap()).unwrap();
        assert_eq!(name, "wall.png");
        // 副本存在于 Background，且内容一致
        assert!(base.join("Background").join("wall.png").exists());
        assert_eq!(
            fs::read(base.join("Background").join("wall.png")).unwrap(),
            b"png-data"
        );
        // 原始文件未被移动/删除
        assert!(src.exists());
    }

    #[test]
    fn import_renames_on_collision() {
        let base = tmp_base("collision");
        let src_dir = base.join("src");
        fs::create_dir_all(&src_dir).unwrap();
        fs::write(src_dir.join("a.png"), b"1").unwrap();
        // 预置同名文件
        fs::create_dir_all(base.join("Background")).unwrap();
        fs::write(base.join("Background").join("a.png"), b"old").unwrap();

        let name = import_file(&base, src_dir.join("a.png").to_str().unwrap()).unwrap();
        assert_eq!(name, "a (1).png");
        assert!(base.join("Background").join("a (1).png").exists());
        // 原同名文件未被覆盖
        assert_eq!(
            fs::read(base.join("Background").join("a.png")).unwrap(),
            b"old"
        );
    }

    #[test]
    fn import_rejects_unsupported_format() {
        let base = tmp_base("unsupported");
        let src = base.join("evil.gif");
        fs::write(&src, b"gif").unwrap();
        assert!(import_file(&base, src.to_str().unwrap()).is_err());
        assert!(!base.join("Background").exists());
    }

    #[test]
    fn list_filters_non_supported_formats() {
        let base = tmp_base("list");
        let dir = base.join("Background");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("a.png"), b"1").unwrap();
        fs::write(dir.join("b.JPG"), b"2").unwrap();
        fs::write(dir.join("c.webm"), b"3").unwrap();
        fs::write(dir.join("d.mp4"), b"4").unwrap();
        fs::write(dir.join("e.gif"), b"5").unwrap(); // 应过滤
        fs::write(dir.join("f.txt"), b"6").unwrap(); // 应过滤
        fs::write(dir.join("g.webp"), b"7").unwrap();
        fs::write(dir.join("h.jpeg"), b"8").unwrap();

        let files = list_files(&base).unwrap();
        let names: Vec<&str> = files.iter().map(|f| f.name.as_str()).collect();
        // JPG 大写扩展名也被识别；gif/txt 被过滤
        assert_eq!(
            names,
            vec!["a.png", "b.JPG", "c.webm", "d.mp4", "g.webp", "h.jpeg"]
        );
        // 每条都带绝对路径
        for f in &files {
            assert!(Path::new(&f.path).is_file());
        }
    }

    #[test]
    fn list_missing_dir_returns_empty() {
        let base = tmp_base("missing");
        assert!(list_files(&base).unwrap().is_empty());
    }

    #[test]
    fn delete_removes_file_and_rejects_traversal() {
        let base = tmp_base("delete");
        let dir = base.join("Background");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("a.png"), b"1").unwrap();
        fs::write(dir.join("b.png"), b"2").unwrap();

        delete_file(&base, "a.png").unwrap();
        assert!(!dir.join("a.png").exists());
        assert!(dir.join("b.png").exists());

        // 路径穿越/绝对路径被拒
        assert!(delete_file(&base, "../Background/b.png").is_err());
        assert!(delete_file(&base, "C:\\Windows\\win.ini").is_err());
        assert!(delete_file(&base, "..").is_err());
        assert!(dir.join("b.png").exists());
    }
}