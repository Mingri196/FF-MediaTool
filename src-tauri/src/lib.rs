mod ffmpeg;
mod media;
mod settings;
mod task;
mod util;

use std::sync::Arc;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(Arc::new(task::TaskManager::new()))
        .setup(|app| {
            // 启动任务调度主循环（串行队列泵）
            let manager = app.state::<Arc<task::TaskManager>>().inner().clone();
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                manager.pump(handle).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            settings::get_settings,
            settings::save_settings,
            ffmpeg::detect_ffmpeg,
                            ffmpeg::validate_ffmpeg_paths,
                            media::media_probe_basic,
                            media::media_probe_full,
                            media::detect_crop,
                            task::task_add,
            task::task_stop,
            task::task_remove,
            task::task_reorder,
            task::task_clear_finished,
            task::tasks_snapshot,
            util::write_text_file,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        // 应用退出时：杀掉仍在运行的 ffmpeg 子进程，杜绝残留（PRD 6.3）
        if let tauri::RunEvent::ExitRequested { .. } = event {
            if let Some(manager) = app_handle.try_state::<Arc<task::TaskManager>>() {
                let m = manager.inner().clone();
                tauri::async_runtime::block_on(async move { m.shutdown().await });
            }
        }
    });
}
