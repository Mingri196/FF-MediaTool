import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, CropDetect, FfmpegStatus, MediaBasicInfo, MediaFullInfo, OutputFileCheck, ValidationResult } from "@/types";

/** 后端命令的强类型封装。命令名与 src-tauri/src/lib.rs 中注册的一致。 */
export const api = {
  getSettings: () => invoke<AppSettings>("get_settings"),
  saveSettings: (settings: AppSettings) =>
    invoke<AppSettings>("save_settings", { settings }),
  openOptDir: () => invoke<void>("open_opt_dir"),
  detectFfmpeg: () => invoke<FfmpegStatus>("detect_ffmpeg"),
  validateFfmpegPaths: (ffmpegPath: string | null, ffprobePath: string | null) =>
    invoke<FfmpegStatus>("validate_ffmpeg_paths", { ffmpegPath, ffprobePath }),
  /** 媒体基础信息（时长 + 流列表），供转换/剪辑页 */
  mediaProbeBasic: (path: string) => invoke<MediaBasicInfo>("media_probe_basic", { path }),
  /** 全量媒体信息（模块五） */
  mediaProbeFull: (path: string) => invoke<MediaFullInfo>("media_probe_full", { path }),
  /** 去黑边自动检测 */
  detectCrop: (path: string) => invoke<CropDetect>("detect_crop", { path }),
  /** 写文本文件（日志/信息导出） */
  writeTextFile: (path: string, content: string) => invoke<void>("write_text_file", { path, content }),
  /** 检查输出文件是否存在 */
  checkOutputFile: (path: string) => invoke<OutputFileCheck>("check_output_file", { path }),
  /** 校验任务参数 */
  validateTaskArgs: (input: string, output: string, vcodec?: string | null, acodec?: string | null, hasVf?: boolean, hasAf?: boolean) =>
    invoke<ValidationResult>("validate_task_args", { input, output, vcodec: vcodec ?? null, acodec: acodec ?? null, hasVf: hasVf ?? false, hasAf: hasAf ?? false }),
};

export { invoke };