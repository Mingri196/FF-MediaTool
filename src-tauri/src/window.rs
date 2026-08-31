/// 窗口装饰辅助：decorations=false 自制标题栏模式下
/// 用 Win32 API 为窗口开启圆角，观感接近原生软件。
/// 老系统（Win10 早期等）DWM 圆角可能不支持——所有调用捕获错误，失败静默，绝不崩溃。

/// 给主窗口开启圆角（Win10 1703+ DWM 圆角偏好）。
/// 非 Windows / 调用失败时静默返回（不崩溃）。
pub fn apply_rounded_corners(app: &tauri::AppHandle) {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::Graphics::Dwm::{
            DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
        };
        use tauri::Manager;

        if let Some(win) = app.get_webview_window("main") {
            if let Ok(hwnd) = win.hwnd() {
                // DWM_WINDOW_CORNER_PREFERENCE = DWMWCP_ROUND(2)
                let pref: i32 = DWMWCP_ROUND.0 as i32;
                unsafe {
                    let _ = DwmSetWindowAttribute(
                        HWND(hwnd.0),
                        DWMWA_WINDOW_CORNER_PREFERENCE,
                        &pref as *const i32 as *const core::ffi::c_void,
                        core::mem::size_of::<i32>() as u32,
                    );
                }
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
    }
}
