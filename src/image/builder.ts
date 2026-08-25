/**
 * 图片 ffmpeg 命令行 builder（纯函数，vitest 单测）。
 * 输入：ImageParams + 输入文件路径 + 输出文件路径
 * 输出：完整 args 数组（不含可执行文件与自动附加的 -y/-nostats/-progress）
 */
import type { ImageParams } from "./types";

export function buildImageArgs(
  params: ImageParams,
  input: string,
  output: string,
): string[] {
  const args: string[] = ["-i", input];
  const vfParts: string[] = [];

  const isLossless = params.lossless;

  // --- 编码器 & 质量 ---
  const preset = getCodec(params.format, isLossless);
  args.push("-c:v", preset.codec);

  if (preset.qualityArg && !isLossless) {
    if (preset.qualityArg === "q:v") {
      if (params.format === "jpg") {
        // ffmpeg mjpeg q:v 2-31 (2=best, 31=worst)
        const q = Math.round(31 - (params.quality / 100) * 29);
        args.push(`-${preset.qualityArg}`, String(q));
      } else {
        // webp/avif: quality 0-100
        args.push(`-${preset.qualityArg}`, String(params.quality));
      }
    }
  }

  if (params.format === "jpg") {
    if (params.progressive) args.push("-flags", "+ilme+ildct");
    if (params.chromaSampling !== "default") {
      // ffmpeg pixel format control
      const pixFmtMap: Record<string, string> = { "4:4:4": "yuv444p", "4:2:2": "yuv422p", "4:2:0": "yuv420p" };
      args.push("-pix_fmt", pixFmtMap[params.chromaSampling] ?? "yuv420p");
    }
  }

  if (params.format === "png" && !isLossless) {
    args.push("-compression_level", String(params.compressionLevel));
  }

  if (params.format === "webp" || params.format === "avif") {
    if (isLossless) {
      args.push("-lossless", "1");
    }
    if (params.format === "webp") {
      args.push("-preset", "picture");
      if (params.webpSpeed >= 0) args.push("-compression_level", String(6 - Math.min(6, params.webpSpeed)));
    }
    if (params.format === "avif") {
      if (params.avifSpeed >= 0) args.push("-cpu-used", String(params.avifSpeed));
      if (params.avifDepth > 8) args.push("-pix_fmt", "yuv420p10le");
    }
  }

  if (params.format === "gif") {
    // palettegen + paletteuse for better quality
    // Simple: use palette
    if (params.gifColors < 256) {
      vfParts.push(`palettegen=stats_mode=full:max_colors=${params.gifColors}[pal],[pal]paletteuse=dither=bayer`);
    }
  }

  // --- 裁剪 ---
  if (params.crop.enabled && params.crop.w > 0 && params.crop.h > 0) {
    vfParts.push(`crop=${params.crop.w}:${params.crop.h}:${params.crop.x}:${params.crop.y}`);
  }

  // --- 尺寸调整 ---
  const scale = buildScale(params);
  if (scale) vfParts.push(scale);

  // --- 旋转 ---
  if (params.rotate !== 0) {
    const rotMap: Record<number, string> = {
      90: "transpose=1",
      180: "transpose=2,transpose=2",
      270: "transpose=2",
    };
    if (rotMap[params.rotate]) vfParts.push(rotMap[params.rotate]);
  }
  if (params.flipH) vfParts.push("hflip");
  if (params.flipV) vfParts.push("vflip");

  // --- 色彩 ---
  const eqParts: string[] = [];
  if (params.color.brightness !== 0) eqParts.push(`brightness=${params.color.brightness.toFixed(2)}`);
  if (params.color.contrast !== 1) eqParts.push(`contrast=${params.color.contrast.toFixed(2)}`);
  if (params.color.saturation !== 1) eqParts.push(`saturation=${params.color.saturation.toFixed(2)}`);
  if (eqParts.length > 0) vfParts.push(`eq=${eqParts.join(":")}`);

  // --- 画布扩展 ---
  if (params.canvas.enabled && params.canvas.w > 0 && params.canvas.h > 0) {
    const bg = params.canvas.bgColor.replace("#", "");
    vfParts.push(`pad=${params.canvas.w}:${params.canvas.h}:${Math.round((params.canvas.w - 0) / 2)}:${Math.round((params.canvas.h - 0) / 2)}:color=#${bg}`);
  }

  // --- 滤镜 ---
  if (vfParts.length > 0) {
    args.push("-vf", vfParts.join(","));
  }

  // --- 输出 ---
  args.push(output);
  return args;
}

function buildScale(params: ImageParams): string | null {
  const { resize } = params;
  if (resize.mode === "none") return null;
  switch (resize.mode) {
    case "percent": {
      const w = resize.value; // pct
      return `scale=iw*${w}/100:ih*${w}/100:flags=lanczos`;
    }
    case "fitWidth":
      return `scale=${resize.value}:-1:flags=lanczos`;
    case "fitHeight":
      return `scale=-1:${resize.value}:flags=lanczos`;
    case "fixed":
      return `scale=${resize.value}:${resize.value2}:flags=lanczos:force_original_aspect_ratio=disable`;
    case "custom": {
      const w = Math.round(resize.value);
      const h = Math.round(resize.value2);
      if (resize.adaptMode === "none") return `scale=${w}:${h}:flags=lanczos:force_original_aspect_ratio=disable`;
      if (resize.adaptMode === "fill") return `scale=${w}:${h}:flags=lanczos:force_original_aspect_ratio=disable`;
      if (resize.adaptMode === "contain") return `scale='min(${w},iw)':'min(${h},ih)':flags=lanczos:force_original_aspect_ratio=1:pad=1:color=black`;
      if (resize.adaptMode === "cover") return `scale=${w}:${h}:flags=lanczos:force_original_aspect_ratio=1,crop=${w}:${h}`;
      return `scale=${w}:${h}:flags=lanczos:force_original_aspect_ratio=disable`;
    }
    case "fill":
      return `scale=${resize.value}:${resize.value2}:flags=lanczos:force_original_aspect_ratio=1`;
    case "contain":
      return `scale='min(${resize.value},iw)':'min(${resize.value2},ih)':flags=lanczos:force_original_aspect_ratio=1:pad=1:color=black`;
    case "cover":
      return `scale=${resize.value}:${resize.value2}:flags=lanczos:force_original_aspect_ratio=1,crop=${resize.value}:${resize.value2}`;
    default:
      return null;
  }
}

interface CodecConfig {
  codec: string;
  qualityArg: string | null;
}

function getCodec(fmt: string, lossless: boolean): CodecConfig {
  switch (fmt) {
    case "jpg": return { codec: "mjpeg", qualityArg: "q:v" };
    case "png": return { codec: "png", qualityArg: null };
    case "webp": return { codec: lossless ? "libwebp_anim" : "libwebp", qualityArg: "quality" };
    case "bmp": return { codec: "bmp", qualityArg: null };
    case "gif": return { codec: "gif", qualityArg: null };
    case "tiff": return { codec: "tiff", qualityArg: null };
    case "ico": return { codec: "bmp", qualityArg: null };
    case "avif": return { codec: lossless ? "libaom-av1" : "libsvtav1", qualityArg: "quality" };
    default: return { codec: "mjpeg", qualityArg: "q:v" };
  }
}

/** 生成批量输出路径 */
export function genOutputPath(
  inputPath: string,
  format: string,
  index: number,
  prefix: string,
  suffix: string,
  seq: number,
  outputDir: string,
): string {
  const name = inputPath.split(/[\\/]/).pop() ?? "image";
  const base = name.replace(/\.[^.]+$/, "");
  const ext = format === "jpg" ? "jpg" : format;
  const seqStr = String(seq + index).padStart(3, "0");
  const outName = `${prefix}${base}${suffix}_${seqStr}.${ext}`;
  const dir = outputDir || (inputPath.match(/^(.+)[\\/]/)?.[1] ?? "");
  return `${dir}/${outName}`;
}