import type { I18nKey } from "@/i18n/locales/zh";
import type { AudioCodec, AudioParams } from "./types";

/** 输出格式 → 默认编码器/质量 智能匹配表（PRD 4.1） */
export interface AudioFormatPreset {
  ext: string;
  label: I18nKey;
  acodec: AudioCodec;
  mode: AudioParams["mode"];
  bitrateK: number;
  vbrQuality: number;
  /** 无损格式：可选流复制保留原始音质（PRD 4.1） */
  lossless: boolean;
}

export const AUDIO_FORMATS: AudioFormatPreset[] = [
  { ext: "mp3", label: "afmt.mp3", acodec: "libmp3lame", mode: "cbr", bitrateK: 192, vbrQuality: 4, lossless: false },
  { ext: "aac", label: "afmt.aac", acodec: "aac", mode: "cbr", bitrateK: 192, vbrQuality: 4, lossless: false },
  { ext: "m4a", label: "afmt.m4a", acodec: "aac", mode: "cbr", bitrateK: 192, vbrQuality: 4, lossless: false },
  { ext: "ogg", label: "afmt.ogg", acodec: "libvorbis", mode: "vbr", bitrateK: 192, vbrQuality: 4, lossless: false },
  { ext: "opus", label: "afmt.opus", acodec: "libopus", mode: "vbr", bitrateK: 128, vbrQuality: 5, lossless: false },
  { ext: "wma", label: "afmt.wma", acodec: "wmav2", mode: "cbr", bitrateK: 128, vbrQuality: 4, lossless: false },
  { ext: "flac", label: "afmt.flac", acodec: "flac", mode: "lossless", bitrateK: 0, vbrQuality: 0, lossless: true },
  { ext: "wav", label: "afmt.wav", acodec: "pcm_s16le", mode: "lossless", bitrateK: 0, vbrQuality: 0, lossless: true },
  { ext: "aiff", label: "afmt.aiff", acodec: "pcm_s16le", mode: "lossless", bitrateK: 0, vbrQuality: 0, lossless: true },
  { ext: "wv", label: "afmt.wv", acodec: "wavpack", mode: "lossless", bitrateK: 0, vbrQuality: 0, lossless: true },
];

/** 可用音频编码器 */
export const AUDIO_CODECS: { value: AudioCodec; labelKey: I18nKey; group: "lossy" | "lossless" | "copy" }[] = [
  { value: "libmp3lame", labelKey: "acodecFull.libmp3lame", group: "lossy" },
  { value: "aac", labelKey: "acodecFull.aac", group: "lossy" },
  { value: "libopus", labelKey: "acodecFull.libopus", group: "lossy" },
  { value: "libvorbis", labelKey: "acodecFull.libvorbis", group: "lossy" },
  { value: "wmav2", labelKey: "acodecFull.wmav2", group: "lossy" },
  { value: "flac", labelKey: "acodecFull.flac", group: "lossless" },
  { value: "wavpack", labelKey: "acodecFull.wavpack", group: "lossless" },
  { value: "pcm_s16le", labelKey: "acodecFull.pcm_s16le", group: "lossless" },
  { value: "pcm_s24le", labelKey: "acodecFull.pcm_s24le", group: "lossless" },
  { value: "copy", labelKey: "codec.copy", group: "copy" },
];

/** 采样率选项 */
export const AUDIO_SAMPLE_RATES = [8000, 11025, 16000, 22050, 32000, 44100, 48000, 88200, 96000, 176400, 192000] as const;

/** 位深选项（0=自动） */
export const AUDIO_BIT_DEPTHS = [16, 24, 32] as const;