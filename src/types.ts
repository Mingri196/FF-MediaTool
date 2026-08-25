/** 与 src-tauri/src/settings.rs 中 AppSettings 一一对应（camelCase） */
export type Language = "zh" | "en";
export type ThemeMode = "light" | "dark" | "system";

export type PageId =
  | "video-convert"
  | "audio-convert"
  | "image-convert"
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

/** 容器信息（模块五） */
export interface FormatInfo {
  filename: string;
  formatName: string;
  formatLongName: string;
  duration: number;
  size: number;
  bitRate: number | null;
  startTime: number;
  nbStreams: number;
}

/** 视频流详细信息（模块五） */
export interface VideoStreamInfo {
  index: number; codecName: string; codecLongName: string; profile: string; level: number;
  width: number; height: number; codedWidth: number; codedHeight: number; pixFmt: string;
  colorSpace: string; colorPrimaries: string; colorTransfer: string; chromaLocation: string;
  fieldOrder: string; hasBFrames: number; sampleAspectRatio: string; displayAspectRatio: string;
  rFrameRate: string; avgFrameRate: string; bitRate: number | null; bitsPerRawSample: number | null;
  refs: number; nbFrames: number | null; duration: number; tags: Record<string, string>;
}

/** 音频流详细信息（模块五） */
export interface AudioStreamInfo {
  index: number; codecName: string; codecLongName: string; profile: string;
  sampleFmt: string; sampleRate: number; channels: number; channelLayout: string;
  bitRate: number | null; maxBitRate: number | null; bitsPerSample: number;
  duration: number; nbFrames: number | null; tags: Record<string, string>;
}

/** 全量媒体信息（模块五） */
export interface MediaFullInfo {
  ok: boolean; error: string | null;
  format: FormatInfo; videoStreams: VideoStreamInfo[]; audioStreams: AudioStreamInfo[];
  metadata: Record<string, string>;
}

/** 输出文件检查（模块六） */
export interface OutputFileCheck {
  exists: boolean; size: number; modified: string;
}

/** 参数校验结果（模块六） */
export interface ValidationResult {
  errors: string[]; warnings: string[];
}