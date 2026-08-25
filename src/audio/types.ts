/**
 * 音频参数模型（表单状态与预设序列化共用）。
 */

export type AudioCodec =
  | "libmp3lame"
  | "aac"
  | "flac"
  | "libopus"
  | "libvorbis"
  | "pcm_s16le"
  | "pcm_s24le"
  | "wavpack"
  | "wmav2"
  | "copy";

export type AudioQualityMode = "cbr" | "vbr" | "lossless";

/** 声道处理模式 */
export type ChannelMode = "none" | "swap" | "mono" | "stereo-upmix" | "downmix";

export interface AudioParams {
  acodec: AudioCodec;
  /** 质量模式（copy 时无意义） */
  mode: AudioQualityMode;
  /** CBR 码率 kbps */
  bitrateK: number;
  /** VBR 质量 0-9（越低越好，mp3 语义；opus 0-10） */
  vbrQuality: number;
  /** 采样率 Hz；0=保持 */
  sampleRate: number;
  /** 位深 16/24/32；0=保持 */
  bitDepth: number;
  /** 声道 0/1/2/6/8 */
  channels: number;
  /* ---------- 音量 ---------- */
  /** 增益 dB（0=不动） */
  gainDb: number;
  /** 淡入秒 */
  fadeInSec: number;
  /** 淡出秒（0=到结尾） */
  fadeOutSec: number;
  /** 自动音量归一化（loudnorm） */
  loudnorm: boolean;
  /* ---------- 声道处理 ---------- */
  channelMode: ChannelMode;
  /* ---------- 滤镜 ---------- */
  /** 降噪（afftdn） */
  denoise: boolean;
  /** 消人声（相位抵消，卡拉OK效果） */
  vocalRemoval: boolean;
  /** 变速不变调 0.5~2.0（1=不变） */
  tempo: number;
  /** 混响（aecho） */
  reverb: boolean;
  /** 三频段均衡（-12 ~ +12 dB，0=平直） */
  eqBass: number;
  eqMid: number;
  eqTreble: number;
}

export interface AudioExtractParams {
  /** 从视频提取音轨：目标音轨序号（-1=全部音频流） */
  trackIndex: number;
}

export function defaultAudioParams(): AudioParams {
  return {
    acodec: "libmp3lame",
    mode: "cbr",
    bitrateK: 192,
    vbrQuality: 4,
    sampleRate: 0,
    bitDepth: 0,
    channels: 2,
    gainDb: 0,
    fadeInSec: 0,
    fadeOutSec: 0,
    loudnorm: false,
    channelMode: "none",
    denoise: false,
    vocalRemoval: false,
    tempo: 1,
    reverb: false,
    eqBass: 0,
    eqMid: 0,
    eqTreble: 0,
  };
}