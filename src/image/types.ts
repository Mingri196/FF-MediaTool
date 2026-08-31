/**
 * 图片参数模型（表单状态与预设序列化共用）。
 */

export type ImageFormat = "jpg" | "png" | "webp" | "bmp" | "gif" | "tiff" | "ico" | "avif";

export const IMAGE_OUTPUT_FORMATS: ImageFormat[] = ["jpg", "png", "webp", "bmp", "gif", "tiff", "ico", "avif"];

export const IMAGE_EXT_MAP: Record<ImageFormat, string[]> = {
  jpg: ["jpg", "jpeg"],
  png: ["png"],
  webp: ["webp"],
  bmp: ["bmp"],
  gif: ["gif"],
  tiff: ["tiff", "tif"],
  ico: ["ico"],
  avif: ["avif"],
};

export type ResizeMode = "none" | "percent" | "fitWidth" | "fitHeight" | "fixed" | "custom" | "fill" | "contain" | "cover";

/** GIF 输出时的处理模式：拆分（GIF→PNG 序列）/ 合成（图片序列→GIF）/ 普通转换 */
export type GifMode = "none" | "split" | "combine";

export interface ImageResize {
  mode: ResizeMode;
  value: number;
  value2: number;
  dpi: number;
  adaptMode: "none" | "fill" | "contain" | "cover";
}

export type RotateAngle = 0 | 90 | 180 | 270;

export interface ImageCrop {
  enabled: boolean;
  w: number;
  h: number;
  x: number;
  y: number;
  aspectRatio: string; // "free" | "1:1" | "16:9" | "4:3" | "3:2" | "21:9"
}

export interface ImageColor {
  brightness: number; // -1..1, default 0
  contrast: number;   // 0..2, default 1
  saturation: number; // 0..3, default 1
}

export interface ImageCanvas {
  enabled: boolean;
  w: number;
  h: number;
  bgColor: string; // hex #RRGGBB
}

export interface ImageParams {
  format: ImageFormat;
  lossless: boolean;
  // JPEG/WebP/AVIF
  quality: number;       // 1-100
  // JPEG
  progressive: boolean;
  chromaSampling: string; // "default" | "4:4:4" | "4:2:2" | "4:2:0"
  // PNG
  compressionLevel: number; // 0-9
  keepAlpha: boolean;
  // WebP
  webpSpeed: number;     // 0-6
  // AVIF
  avifDepth: number;     // 8 | 10 | 12
  avifSpeed: number;     // 0-8
  // GIF
  gifFps: number;
  gifLoop: number;       // 0 = infinite
  gifColors: number;     // 2-256
  gifMode: GifMode;      // GIF 拆分/合成模式（仅 format=gif 时生效，其余格式忽略）
  // 尺寸调整
  resize: ImageResize;
  // 旋转翻转
  rotate: RotateAngle;
  flipH: boolean;
  flipV: boolean;
  // 裁剪
  crop: ImageCrop;
  // 色彩
  color: ImageColor;
  // 画布扩展
  canvas: ImageCanvas;
  // 输出命名
  outputDir: string;
  namingPrefix: string;
  namingSuffix: string;
  namingSeq: number;     // 起始序号
  onConflict: "overwrite" | "autoNumber" | "ask";
}

export function defaultImageParams(): ImageParams {
  return {
    format: "jpg",
    lossless: false,
    quality: 85,
    progressive: false,
    chromaSampling: "default",
    compressionLevel: 6,
    keepAlpha: true,
    webpSpeed: 4,
    avifDepth: 8,
    avifSpeed: 4,
    gifFps: 10,
    gifLoop: 0,
    gifColors: 256,
    gifMode: "none",
    resize: { mode: "none", value: 100, value2: 0, dpi: 72, adaptMode: "none" },
    rotate: 0,
    flipH: false,
    flipV: false,
    crop: { enabled: false, w: 0, h: 0, x: 0, y: 0, aspectRatio: "free" },
    color: { brightness: 0, contrast: 1, saturation: 1 },
    canvas: { enabled: false, w: 0, h: 0, bgColor: "#FFFFFF" },
    outputDir: "",
    namingPrefix: "",
    namingSuffix: "",
    namingSeq: 1,
    onConflict: "autoNumber",
  };
}

export interface ImageFileItem {
  path: string;
  name: string;
  size: number;
  ext: string;
}