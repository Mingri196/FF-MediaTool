/**
 * 图片格式预设：输出格式 → 默认编码器/参数 + 输入格式白名单
 */
import type { I18nKey } from "@/i18n/locales/zh";
import type { ImageFormat, ImageParams } from "./types";

export interface ImageFormatPreset {
  format: ImageFormat;
  ext: string;
  labelKey: I18nKey;
  codec: string;
  lossless: boolean;
  defaultQuality: number;
  supportsQuality: boolean;
  supportsProgressive: boolean;
  supportsChroma: boolean;
  supportsAlpha: boolean;
  supportsAnim: boolean;
}

export const IMAGE_FORMAT_PRESETS: ImageFormatPreset[] = [
  { format: "jpg", ext: "jpg", labelKey: "img.format.jpg", codec: "mjpeg", lossless: false, defaultQuality: 85, supportsQuality: true, supportsProgressive: true, supportsChroma: true, supportsAlpha: false, supportsAnim: false },
  { format: "png", ext: "png", labelKey: "img.format.png", codec: "png", lossless: true, defaultQuality: 0, supportsQuality: false, supportsProgressive: false, supportsChroma: false, supportsAlpha: true, supportsAnim: false },
  { format: "webp", ext: "webp", labelKey: "img.format.webp", codec: "libwebp", lossless: false, defaultQuality: 80, supportsQuality: true, supportsProgressive: false, supportsChroma: false, supportsAlpha: true, supportsAnim: false },
  { format: "bmp", ext: "bmp", labelKey: "img.format.bmp", codec: "bmp", lossless: true, defaultQuality: 0, supportsQuality: false, supportsProgressive: false, supportsChroma: false, supportsAlpha: false, supportsAnim: false },
  { format: "gif", ext: "gif", labelKey: "img.format.gif", codec: "gif", lossless: false, defaultQuality: 0, supportsQuality: false, supportsProgressive: false, supportsChroma: false, supportsAlpha: false, supportsAnim: true },
  { format: "tiff", ext: "tiff", labelKey: "img.format.tiff", codec: "tiff", lossless: true, defaultQuality: 0, supportsQuality: false, supportsProgressive: false, supportsChroma: false, supportsAlpha: true, supportsAnim: false },
  { format: "ico", ext: "ico", labelKey: "img.format.ico", codec: "bmp", lossless: true, defaultQuality: 0, supportsQuality: false, supportsProgressive: false, supportsChroma: false, supportsAlpha: true, supportsAnim: false },
  { format: "avif", ext: "avif", labelKey: "img.format.avif", codec: "libaom-av1", lossless: false, defaultQuality: 50, supportsQuality: true, supportsProgressive: false, supportsChroma: false, supportsAlpha: true, supportsAnim: false },
];

/** 支持的输入格式扩展名（含大写变体） */
export const INPUT_IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "bmp", "gif", "tiff", "tif", "ico", "avif", "jxl", "tga", "ppm", "pgm"];

export function getPreset(fmt: ImageFormat): ImageFormatPreset {
  return IMAGE_FORMAT_PRESETS.find((p) => p.format === fmt)!;
}

export function applyFormatDefaults(p: ImageParams, fmt: ImageFormat): ImageParams {
  const preset = getPreset(fmt);
  return {
    ...p,
    format: fmt,
    lossless: preset.lossless,
    quality: preset.defaultQuality,
    compressionLevel: 6,
    webpSpeed: 4,
    avifDepth: 8,
    avifSpeed: 4,
  };
}