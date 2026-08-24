/**
 * 输出格式 → 默认编码器/参数 智能匹配表（PRD 3.1：选格式自动推荐，可手动覆盖）。
 * 音频编码器与码率也随格式联动。
 */
import type { I18nKey } from "@/i18n/locales/zh";
import type { VideoAudioParams, VideoCodec, VideoParams } from "./types";

export interface VideoFormatPreset {
  ext: string;
  label: I18nKey;
  vcodec: VideoCodec;
  qualityMode: VideoParams["qualityMode"];
  crf: number;
  bitrateK: number; // ABR/CBR 默认
  audio: Pick<VideoAudioParams, "acodec" | "bitrateK">;
  /** 格式适配备注（i18n key，可空） */
  note?: I18nKey;
}

export const VIDEO_FORMATS: VideoFormatPreset[] = [
  {
    ext: "mp4",
    label: "fmt.mp4",
    vcodec: "libx264",
    qualityMode: "crf",
    crf: 23,
    bitrateK: 2000,
    audio: { acodec: "aac", bitrateK: 128 },
    note: "fmt.noteH264Nvenc",
  },
  { ext: "mkv", label: "fmt.mkv", vcodec: "libx264", qualityMode: "crf", crf: 23, bitrateK: 2000, audio: { acodec: "aac", bitrateK: 128 } },
  { ext: "mov", label: "fmt.mov", vcodec: "libx264", qualityMode: "crf", crf: 23, bitrateK: 2000, audio: { acodec: "aac", bitrateK: 128 } },
  { ext: "m4v", label: "fmt.m4v", vcodec: "libx264", qualityMode: "crf", crf: 23, bitrateK: 2000, audio: { acodec: "aac", bitrateK: 128 } },
  { ext: "webm", label: "fmt.webm", vcodec: "libvpx-vp9", qualityMode: "crf", crf: 31, bitrateK: 2000, audio: { acodec: "libopus", bitrateK: 128 } },
  { ext: "avi", label: "fmt.avi", vcodec: "libx264", qualityMode: "crf", crf: 23, bitrateK: 2000, audio: { acodec: "mp3", bitrateK: 192 } },
  { ext: "flv", label: "fmt.flv", vcodec: "libx264", qualityMode: "crf", crf: 23, bitrateK: 2000, audio: { acodec: "aac", bitrateK: 96 } },
  { ext: "wmv", label: "fmt.wmv", vcodec: "wmv2", qualityMode: "abr", crf: 23, bitrateK: 2000, audio: { acodec: "wmav2", bitrateK: 128 } },
  { ext: "ts", label: "fmt.ts", vcodec: "libx264", qualityMode: "crf", crf: 23, bitrateK: 2000, audio: { acodec: "aac", bitrateK: 128 } },
];

/** 可用视频编码器（i18n label 由 ui.codec.* 提供） */
export const VIDEO_CODECS: { value: VideoCodec; labelKey: string; group: string }[] = [
  { value: "libx264", labelKey: "codec.libx264", group: "sw" },
  { value: "libx265", labelKey: "codec.libx265", group: "sw" },
  { value: "libvpx-vp9", labelKey: "codec.libvpxVp9", group: "sw" },
  { value: "libaom-av1", labelKey: "codec.libaomAv1", group: "sw" },
  { value: "h264_nvenc", labelKey: "codec.h264Nvenc", group: "hw" },
  { value: "hevc_nvenc", labelKey: "codec.hevcNvenc", group: "hw" },
  { value: "h264_qsv", labelKey: "codec.h264Qsv", group: "hw" },
  { value: "hevc_qsv", labelKey: "codec.hevcQsv", group: "hw" },
  { value: "h264_amf", labelKey: "codec.h264Amf", group: "hw" },
  { value: "copy", labelKey: "codec.copy", group: "copy" },
];

export const X264_PRESETS = [
  "ultrafast",
  "superfast",
  "veryfast",
  "faster",
  "fast",
  "medium",
  "slow",
  "slower",
  "veryslow",
  "placebo",
] as const;

export const TUNES = ["", "film", "animation", "grain", "stillimage", "fastdecode", "zerolatency", "psnr", "ssim"] as const;

export const PROFILES = ["", "baseline", "main", "high", "high10", "high422", "high444"] as const;

export const LEVELS = ["", "3.0", "3.1", "4.0", "4.1", "4.2", "5.0", "5.1", "5.2", "6.0"] as const;

export const PIX_FMTS = [
  { value: "", labelKey: "pix.auto" },
  { value: "yuv420p", labelKey: "pix.yuv420p" },
  { value: "yuv422p", labelKey: "pix.yuv422p" },
  { value: "yuv444p", labelKey: "pix.yuv444p" },
  { value: "yuv420p10le", labelKey: "pix.yuv420p10le" },
  { value: "yuv422p10le", labelKey: "pix.yuv422p10le" },
  { value: "yuv444p10le", labelKey: "pix.yuv444p10le" },
] as const;

export const AUDIO_CODECS = [
  { value: "aac", labelKey: "acodec.aac" },
  { value: "mp3", labelKey: "acodec.mp3" },
  { value: "libopus", labelKey: "acodec.libopus" },
  { value: "copy", labelKey: "codec.copy" },
  { value: "none", labelKey: "acodec.none" },
] as const;

/** 质量模式（PRD 3.3：CRF / CBR / ABR） */
export const QUALITY_MODES = [
  { value: "crf", labelKey: "quality.crf" },
  { value: "abr", labelKey: "quality.abr" },
  { value: "cbr", labelKey: "quality.cbr" },
] as const;