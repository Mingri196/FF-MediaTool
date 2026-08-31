//! 全局设置：JSON 持久化到应用数据目录，原子写入（临时文件 + rename）。
//! 所有设置项的持久化统一走这里，前端通过 `get_settings` / `save_settings` 读写。

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};

const SETTINGS_FILE: &str = "settings.json";

/// 用户保存的编码预设模板。`params` 为结构化参数对象，
/// 由前端按 category 类型化为 VideoParams / AudioParams（模块三/四定义）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncoderPreset {
    pub id: String,
    pub name: String,
    /// "video" | "audio"
    pub category: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub params: Value,
}

/// 应用全局设置。字段与前端 src/types.ts 中的 AppSettings 一一对应。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    /// "zh" | "en"
    pub language: String,
    /// "light" | "dark" | "system"
    pub theme: String,
    /// 自定义强调色，格式 #RRGGBB
    pub accent_color: String,
    /// 手动指定的 FFmpeg 可执行文件路径（绿色版）；None = 使用系统 PATH
    pub ffmpeg_path: Option<String>,
    /// 手动指定的 ffprobe 路径；None = 使用系统 PATH
    pub ffprobe_path: Option<String>,
    /// 上次使用的输入目录（自动记忆，启动恢复）
    pub last_input_dir: Option<String>,
    /// 上次使用的输出目录（自动记忆，启动恢复）
    pub last_output_dir: Option<String>,
    /// 最近使用过的预设 id（按时间倒序）
    pub recent_presets: Vec<String>,
    /// 用户保存的全部预设模板
    pub presets: Vec<EncoderPreset>,
    /// 首次启动向导是否已完成（FFmpeg 缺失弹窗只在首次启动时自动弹出一次）
    pub has_completed_first_run: bool,
    /// 各功能模块的默认输出路径（自定义；为空时使用全局 opt 目录）
    #[serde(default)]
    pub output_paths: OutputPaths,
    /// 侧边栏是否收起（快捷键 A/← 收起，D/→ 展开；持久化，重启保持）
    #[serde(default)]
    pub sidebar_collapsed: bool,
    /// 是否启用自定义背景（关闭时使用程序默认背景）
    #[serde(default)]
    pub background_enabled: bool,
    /// 当前使用的背景素材文件名（Background 目录内副本，不保存外部路径）
    #[serde(default)]
    pub background_file: Option<String>,
    /// 背景透明度 0-100
    #[serde(default = "default_background_opacity")]
    pub background_opacity: u8,
    /// 板块透明度 0-100（各功能页卡片容器背景；默认 100 不透明）
    #[serde(default = "default_background_opacity")]
    pub panel_opacity: u8,
    /// 侧边栏与运行日志透明度 0-100（独立参数；默认 100 不透明）
    #[serde(default = "default_background_opacity")]
    pub chrome_opacity: u8,
    /// 面板效果："blur" 毛玻璃模糊（默认）/ "transparent" 透明无模糊（仅开启自定义背景时生效）
    #[serde(default = "default_panel_effect")]
    pub panel_effect: String,
    /// 视频背景播放速度 0.5-2.0
    #[serde(default = "default_background_speed")]
    pub background_video_speed: f64,
    /// 运行日志面板状态："collapsed" | "expanded" | "hidden"（Tab 快捷键控制；持久化，重启恢复）
    #[serde(default = "default_log_panel_state")]
    pub log_panel_state: String,
}

fn default_log_panel_state() -> String {
    "collapsed".into()
}

fn default_panel_effect() -> String {
    "blur".into()
}

fn default_background_opacity() -> u8 {
    100
}

fn default_background_speed() -> f64 {
    1.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputPaths {
    pub video_convert: Option<String>,
    pub audio_convert: Option<String>,
    pub image_convert: Option<String>,
    pub video_clip: Option<String>,
    pub quick_task: Option<String>,
}

impl Default for OutputPaths {
    fn default() -> Self {
        Self { video_convert: None, audio_convert: None, image_convert: None, video_clip: None, quick_task: None }
    }
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            language: "zh".into(),
            theme: "system".into(),
            accent_color: "#4f46e5".into(),
            ffmpeg_path: None,
            ffprobe_path: None,
            last_input_dir: None,
            last_output_dir: None,
            recent_presets: Vec::new(),
            presets: Vec::new(),
            has_completed_first_run: false,
            output_paths: OutputPaths::default(),
            sidebar_collapsed: false,
            background_enabled: false,
            background_file: None,
            background_opacity: default_background_opacity(),
            panel_opacity: default_background_opacity(),
            chrome_opacity: default_background_opacity(),
            panel_effect: default_panel_effect(),
            background_video_speed: default_background_speed(),
            log_panel_state: default_log_panel_state(),
        }
    }
}

/// 服务端兜底校验：防止非法值写入设置（前端也有完整校验，这里是双保险）。
fn sanitize(mut s: AppSettings) -> AppSettings {
    if !matches!(s.language.as_str(), "zh" | "en") {
        s.language = "zh".into();
    }
    if !matches!(s.theme.as_str(), "light" | "dark" | "system") {
        s.theme = "system".into();
    }
    if !is_valid_hex_color(&s.accent_color) {
        s.accent_color = "#4f46e5".into();
    }
    // 日志面板状态只允许三值
    if !matches!(s.log_panel_state.as_str(), "collapsed" | "expanded" | "hidden") {
        s.log_panel_state = "collapsed".into();
    }
    // 面板效果只允许 blur / transparent
    if !matches!(s.panel_effect.as_str(), "blur" | "transparent") {
        s.panel_effect = default_panel_effect();
    }
    // 预设 id 去重（保留首个）
    let mut seen = std::collections::HashSet::new();
    s.presets.retain(|p| seen.insert(p.id.clone()));
    // recent_presets 只保留存在于 presets 中的 id，且去重
    let valid_ids: std::collections::HashSet<String> =
        s.presets.iter().map(|p| p.id.clone()).collect();
    let mut seen_recent = std::collections::HashSet::new();
    s.recent_presets
        .retain(|id| valid_ids.contains(id) && seen_recent.insert(id.clone()));
    s
}

fn is_valid_hex_color(s: &str) -> bool {
    let s = s.trim().strip_prefix('#').unwrap_or(s.trim());
    s.len() == 6 && s.chars().all(|c| c.is_ascii_hexdigit())
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位应用数据目录: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("无法创建应用数据目录: {e}"))?;
    Ok(dir.join(SETTINGS_FILE))
}

/// 读取设置；文件不存在或损坏时回退到默认值（损坏文件改名保留，便于排查）。
pub fn load(app: &AppHandle) -> AppSettings {
    let path = match settings_path(app) {
        Ok(p) => p,
        Err(_) => return AppSettings::default(),
    };
    match std::fs::read_to_string(&path) {
        Ok(content) => match serde_json::from_str::<AppSettings>(&content) {
            Ok(s) => sanitize(s),
            Err(e) => {
                // 设置文件损坏：备份后回退默认，避免每次启动反复报错
                let _ = std::fs::rename(
                    &path,
                    path.with_extension(format!("json.bak-{}", now_millis())),
                );
                eprintln!("设置文件损坏，已备份并重置: {e}");
                AppSettings::default()
            }
        },
        Err(_) => AppSettings::default(),
    }
}

/// 原子写入：先写临时文件再 rename，避免写入中途崩溃产生半截 JSON。
pub fn save(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    let json =
        serde_json::to_string_pretty(settings).map_err(|e| format!("设置序列化失败: {e}"))?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| format!("设置写入失败: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("设置保存失败: {e}"))?;
    Ok(())
}

pub fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> AppSettings {
    load(&app)
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: AppSettings) -> Result<AppSettings, String> {
    let clean = sanitize(settings);
    save(&app, &clean)?;
    Ok(clean)
}

/// 在资源管理器中打开应用根目录的 opt 文件夹
#[tauri::command]
pub fn open_opt_dir(app: AppHandle) -> Result<(), String> {
    let resource = app.path().resource_dir().map_err(|e| format!("无法获取资源目录: {e}"))?;
    let opt = resource.join("opt");
    std::fs::create_dir_all(&opt).map_err(|e| format!("无法创建 opt 目录: {e}"))?;
    #[cfg(target_os = "windows")]
    { let _ = std::process::Command::new("explorer").arg(&opt).spawn(); }
    #[cfg(not(target_os = "windows"))]
    { let _ = std::process::Command::new("open").arg(&opt).spawn(); }
    Ok(())
}

/// 返回应用根目录 opt 文件夹的路径（清洗长路径前缀）
#[tauri::command]
pub fn get_opt_dir(app: AppHandle) -> Result<String, String> {
    let resource = app.path().resource_dir().map_err(|e| format!("无法获取资源目录: {e}"))?;
    let opt = resource.join("opt");
    std::fs::create_dir_all(&opt).map_err(|e| format!("无法创建 opt 目录: {e}"))?;
    let raw = opt.to_string_lossy().to_string();
    // 清洗 Windows 长路径前缀 \\?\
    let cleaned = raw.strip_prefix(r"\\?\").unwrap_or(&raw).to_string();
    Ok(cleaned)
}
