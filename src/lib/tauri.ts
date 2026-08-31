import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, BackgroundFile, CropDetect, FfmpegStatus, MediaBasicInfo, MediaFullInfo, OutputFileCheck, ValidationResult } from "@/types";

/** 后端命令的强类型封装。命令名与 src-tauri/src/lib.rs 中注册的一致。 */
export const api = {
  getSettings: () => invoke<AppSettings>("get_settings"),
  saveSettings: (settings: AppSettings) =>
    invoke<AppSettings>("save_settings", { settings }),
  openOptDir: () => invoke<void>("open_opt_dir"),
  getOptDir: () => invoke<string>("get_opt_dir"),
  /** Background 目录绝对路径 */
  backgroundGetDir: () => invoke<string>("background_get_dir"),
  /** 导入背景素材（复制外部文件到 Background 目录），返回内部文件名 */
  backgroundImport: (path: string) => invoke<string>("background_import", { path }),
  /** 图库列表（仅支持格式，含绝对路径） */
  backgroundList: () => invoke<BackgroundFile[]>("background_list"),
  /** 删除图库素材 */
  backgroundDelete: (name: string) => invoke<void>("background_delete", { name }),
  detectFfmpeg: () => invoke<FfmpegStatus>("detect_ffmpeg"),
  validateFfmpegPaths: (ffmpegPath: string | null, ffprobePath: string | null) =>
    invoke<FfmpegStatus>("validate_ffmpeg_paths", { ffmpegPath, ffprobePath }),
  /** 媒体基础信息（时长 + 流列表），供转换/剪辑页 */
  mediaProbeBasic: (path: string) => invoke<MediaBasicInfo>("media_probe_basic", { path }),
  /** 全量媒体信息（模块五） */
  mediaProbeFull: (path: string) => invoke<MediaFullInfo>("media_probe_full", { path }),
  /** 去黑边自动检测 */
  detectCrop: (path: string) => invoke<CropDetect>("detect_crop", { path }),
  /** 扫描目录下的全部文件；exts 可选——图片页默认（图片后缀），视频剪辑页传视频后缀 */
  scanDirectory: (path: string, exts?: string[]) => invoke<string[]>("scan_directory", { path, exts: exts ?? null }),
  /** 写文本文件（日志/信息导出） */
  writeTextFile: (path: string, content: string) => invoke<void>("write_text_file", { path, content }),
  /** 检查输出文件是否存在 */
  checkOutputFile: (path: string) => invoke<OutputFileCheck>("check_output_file", { path }),
  /** 校验任务参数 */
  validateTaskArgs: (input: string, output: string, vcodec?: string | null, acodec?: string | null, hasVf?: boolean, hasAf?: boolean) =>
    invoke<ValidationResult>("validate_task_args", { input, output, vcodec: vcodec ?? null, acodec: acodec ?? null, hasVf: hasVf ?? false, hasAf: hasAf ?? false }),
};

export { invoke };