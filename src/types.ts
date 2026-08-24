/** 与 src-tauri/src/settings.rs 中 AppSettings 一一对应（camelCase） */
export type Language = "zh" | "en";
export type ThemeMode = "light" | "dark" | "system";

export type PageId =
  | "video-convert"
  | "audio-convert"
  | "video-clip"
  | "media-info"
  | "batch"
  | "settings";

export interface EncoderPreset {
  id: string;
  name: string;
  /** "video" | "audio" */
  category: "video" | "audio";
  createdAt: number;
  updatedAt: number;
  /** 结构化参数对象：视频/音频转换页保存时写入（模块三/四定义其形状） */
  params: Record<string, unknown>;
}

export interface AppSettings {
  language: Language;
  theme: ThemeMode;
  accentColor: string;
  ffmpegPath: string | null;
  ffprobePath: string | null;
  lastInputDir: string | null;
  lastOutputDir: string | null;
  recentPresets: string[];
  presets: EncoderPreset[];
  hasCompletedFirstRun: boolean;
}

export interface BinaryInfo {
  path: string;
  version: string;
  source: "path" | "manual";
}

export interface FfmpegStatus {
  ffmpeg: BinaryInfo | null;
  ffprobe: BinaryInfo | null;
  manualInvalid: boolean;
}

/** 媒体基础信息（模块三：转换/剪辑页用；模块五做全量） */
export interface StreamSummary {
  index: number;
  codecType: string;
  codecName: string;
  width: number | null;
  height: number | null;
  sampleRate: number | null;
  channels: number | null;
}

export interface MediaBasicInfo {
  durationMs: number;
  hasVideo: boolean;
  hasAudio: boolean;
  streams: StreamSummary[];
  ok: boolean;
  error: string | null;
}

export interface CropDetect {
  w: number;
  h: number;
  x: number;
  y: number;
}