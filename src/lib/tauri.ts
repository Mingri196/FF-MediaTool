import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, CropDetect, FfmpegStatus, MediaBasicInfo } from "@/types";

/** 后端命令的强类型封装。命令名与 src-tauri/src/lib.rs 中注册的一致。 */
export const api = {
  getSettings: () => invoke<AppSettings>("get_settings"),
  saveSettings: (settings: AppSettings) =>
    invoke<AppSettings>("save_settings", { settings }),
  detectFfmpeg: () => invoke<FfmpegStatus>("detect_ffmpeg"),
  validateFfmpegPaths: (ffmpegPath: string | null, ffprobePath: string | null) =>
    invoke<FfmpegStatus>("validate_ffmpeg_paths", { ffmpegPath, ffprobePath }),
  /** 媒体基础信息（时长 + 流列表），供转换/剪辑页 */
  mediaProbeBasic: (path: string) => invoke<MediaBasicInfo>("media_probe_basic", { path }),
  /** 去黑边自动检测 */
  detectCrop: (path: string) => invoke<CropDetect>("detect_crop", { path }),
};