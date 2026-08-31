/**
 * 视频参数模型（表单状态与预设序列化共用）。
 * 所有字段均为可序列化的纯数据，便于「保存为预设」直接写入 settings.presets。
 */

export type VideoCodec =
  | "libx264"
  | "libx265"
  | "libvpx-vp9"
  | "libaom-av1"
  | "h264_nvenc"
  | "hevc_nvenc"
  | "h264_qsv"
  | "hevc_qsv"
  | "h264_amf"
  | "h264_mf"
  | "wmv2"
  | "copy";

export type QualityMode = "crf" | "abr" | "cbr";

export type X264Preset =
  | "ultrafast"
  | "superfast"
  | "veryfast"
  | "faster"
  | "fast"
  | "medium"
  | "slow"
  | "slower"
  | "veryslow"
  | "placebo";

export type Tune =
  | ""
  | "film"
  | "animation"
  | "grain"
  | "stillimage"
  | "fastdecode"
  | "zerolatency"
  | "psnr"
  | "ssim";

export type PixelFormat =
  | ""
  | "yuv420p"
  | "yuv422p"
  | "yuv444p"
  | "yuv420p10le"
  | "yuv422p10le"
  | "yuv444p10le";

export type FlipMode = "none" | "h" | "v";
export type RotateMode = "none" | "90" | "180" | "270" | "custom";

export interface CropBox {
  w: number;
  h: number;
  x: number;
  y: number;
}

export interface WatermarkCfg {
  image: string;
  /** overlay 坐标；"main_w-overlay_w-16" 等表达式或数字 */
  x: string;
  y: string;
  /** 水印宽度（-1 保持比例） */
  w: number;
  opacity: number; // 0..1
}

export interface SubtitleCfg {
  file: string;
}

export interface VideoParams {
  vcodec: VideoCodec;
  qualityMode: QualityMode;
  crf: number; // 0..51
  bitrateK: number; // kbps，ABR/CBR 用
  maxrateK: number; // kbps，CBR 用
  bufsizeK: number; // kbps，CBR 用
  preset: X264Preset;
  tune: Tune;
  profile: string; // "" | baseline | main | high | high10 ...
  level: string; // "" | 3.0 | 4.0 ...
  pixFmt: PixelFormat;
  /** 帧率；0 = 不调整 */
  fps: number;
  /** 分辨率缩放：0=off, 1=custom, 2=fit-width */
  scaleMode: 0 | 1 | 2;
  /** scaleMode=2 的宽度 */
  scaleWidth: number;
  /** scaleMode=1 的宽高 */
  scaleW: number;
  scaleH: number;
  /** GOP 大小；0 = 自动 */
  gop: number;
  /** B 帧数；-1 = 自动 */
  bframes: number;
  /** 参考帧数；0 = 自动 */
  refs: number;
  /** 场景切换检测 */
  scThreshold: boolean;
  /* ---------- 滤镜 ---------- */
  crop: CropBox | null;
  /** 去黑边：自动检测后的裁剪区域（由 detect_crop 填充） */
  cropDetected: CropBox | null;
  rotate: RotateMode;
  rotateDeg: number; // 任意角度（rotate=custom 时用）
  flip: FlipMode;
  watermark: WatermarkCfg | null;
  subtitles: SubtitleCfg | null;
  denoise: boolean;
  /** 锐化强度 0..5；0 = 关闭 */
  sharpen: number;
  /** 亮度 -1..1（0 默认） */
  brightness: number;
  /** 对比度 0..2（1 默认） */
  contrast: number;
  /** 饱和度 0..3（1 默认） */
  saturation: number;
}

export interface VideoAudioParams {
  acodec: "aac" | "mp3" | "libopus" | "wmav2" | "copy" | "none";
  bitrateK: number; // kbps；0 = 编码器默认
  sampleRate: number; // Hz；0 = 保持
  channels: number; // 0 = 保持；1/2/6/8
}

export interface VideoTaskParams {
  input: string;
  output: string;
  video: VideoParams;
  audio: VideoAudioParams;
}

export function defaultVideoParams(): VideoParams {
  return {
    vcodec: "libx264",
    qualityMode: "crf",
    crf: 23,
    bitrateK: 2000,
    maxrateK: 2500,
    bufsizeK: 5000,
    preset: "medium",
    tune: "",
    profile: "",
    level: "",
    pixFmt: "",
    fps: 0,
    scaleMode: 0,
    scaleWidth: 1280,
    scaleW: 1280,
    scaleH: 720,
    gop: 0,
    bframes: -1,
    refs: 0,
    scThreshold: true,
    crop: null,
    cropDetected: null,
    rotate: "none",
    rotateDeg: 15,
    flip: "none",
    watermark: null,
    subtitles: null,
    denoise: false,
    sharpen: 0,
    brightness: 0,
    contrast: 1,
    saturation: 1,
  };
}

export function defaultVideoAudioParams(): VideoAudioParams {
  return { acodec: "aac", bitrateK: 128, sampleRate: 0, channels: 0 };
}