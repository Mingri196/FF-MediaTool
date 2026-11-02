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
  | "settings"
  | "about"
  | "tools";

export interface EncoderPreset {
  id: string;
  name: string;
  /** 所属模块："video" | "audio" | "image" | "clip" */
  category: "video" | "audio" | "image" | "clip";
  createdAt: number;
  updatedAt: number;
  /** 结构化参数对象：各转换页保存时写入（模块三/四定义其形状） */
  params: Record<string, unknown>;
}

export interface OutputPaths {
  videoConvert?: string | null;
  audioConvert?: string | null;
  imageConvert?: string | null;
  videoClip?: string | null;
  quickTask?: string | null;
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
  outputPaths: OutputPaths;
  /** 侧边栏是否收起（快捷键 A/← 收起，D/→ 展开；持久化，重启保持） */
  sidebarCollapsed: boolean;
  /** 是否启用自定义背景（关闭时使用程序默认背景） */
  backgroundEnabled: boolean;
  /** 当前背景素材文件名（Background 目录内副本） */
  backgroundFile: string | null;
  /** 背景透明度 0-100 */
  backgroundOpacity: number;
  /** 板块透明度 0-100（设置/批量/媒体信息/剪辑/图片/音频/视频页卡片容器；默认 100 不透明） */
  panelOpacity: number;
  /** 侧边栏与运行日志透明度 0-100（独立参数，不受板块透明度联动；默认 100 不透明） */
  chromeOpacity: number;
  /** 面板效果："blur" 毛玻璃模糊（默认）/ "transparent" 透明无模糊（仅开启自定义背景时生效） */
  panelEffect: "blur" | "transparent";
  /** 视频背景播放速度 0.5-2.0 */
  backgroundVideoSpeed: number;
  /** 运行日志面板状态：collapsed 收起小条 / expanded 展开 / hidden 完全隐藏（持久化，重启恢复） */
  logPanelState: "collapsed" | "expanded" | "hidden";
}

/** 图库条目：文件名 + 绝对路径 */
export interface BackgroundFile {
  name: string;
  path: string;
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