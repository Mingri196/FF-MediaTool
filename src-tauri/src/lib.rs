mod ffmpeg;
mod settings;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            settings::get_settings,
            settings::save_settings,
            ffmpeg::detect_ffmpeg,
            ffmpeg::validate_ffmpeg_paths,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
