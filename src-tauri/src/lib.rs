mod background;
mod ffmpeg;
mod media;
mod settings;
mod sysinfo;
mod task;
mod util;
mod window;

use std::sync::Arc;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // 窗口状态恢复排除 DECORATIONS 标志：旧版保存的 decorated:true 会被恢复出来，
        // 覆盖 decorations:false，导致系统原生标题栏+按钮与自制标题栏叠加。
        // 仍恢复位置/大小/最大化等（StateFlags 去掉 DECORATIONS 位）。
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED
                        | tauri_plugin_window_state::StateFlags::VISIBLE
                        | tauri_plugin_window_state::StateFlags::FULLSCREEN,
                )
                .build(),
        )
        .manage(Arc::new(task::TaskManager::new()))
        .setup(|app| {
            // 去原生装饰后给窗口开圆角（Win32 DWM；老系统失败静默）
            window::apply_rounded_corners(app.handle());
            // 后台任务：每 1000ms 读 GPU/CPU/内存 → emit 事件推送到前端自制标题栏
            sysinfo::spawn_title_updater(app.handle().clone());
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
            settings::open_opt_dir,
            settings::get_opt_dir,
            ffmpeg::detect_ffmpeg,
                            ffmpeg::validate_ffmpeg_paths,
                            media::media_probe_basic,
                            media::media_probe_full,
                            media::detect_crop,
                            media::scan_directory,
                            task::task_add,
            task::task_stop,
            task::task_remove,
            task::task_reorder,
            task::task_clear_finished,
            task::tasks_snapshot,
            util::write_text_file,
            util::check_output_file,
            util::validate_task_args,
            background::background_get_dir,
            background::background_import,
            background::background_list,
            background::background_delete,
            sysinfo::system_stats,
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
