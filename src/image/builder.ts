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
        // webp: quality 0-100
        args.push(`-${preset.qualityArg}`, String(params.quality));
      }
    } else if (preset.qualityArg === "crf") {
      // avif(libaom-av1): crf 0-63，越低越好；quality 0-100 → crf 反向映射
      const crf = Math.round(63 - (params.quality / 100) * 63);
      args.push("-crf", String(crf));
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
      if (params.format === "avif") {
        // libaom-av1 无损需 -crf 0（-lossless 1 被 AVIF muxer 忽略）
        args.push("-crf", "0");
      } else {
        args.push("-lossless", "1");
      }
    }
    if (params.format === "webp") {
      args.push("-preset", "picture");
      if (params.webpSpeed >= 0) args.push("-compression_level", String(6 - Math.min(6, params.webpSpeed)));
    }
    if (params.format === "avif") {
      if (params.avifSpeed >= 0) args.push("-cpu-used", String(params.avifSpeed));
      // 显式像素格式：JPG 输入为 yuvj420p（全范围），AVIF 用 yuv420p（有限范围），
      // 不显式指定会让 swscaler 隐式转换并打印 deprecated pixel format 警告
      args.push("-pix_fmt", params.avifDepth > 8 ? "yuv420p10le" : "yuv420p");
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
    case "avif":
      // libaom-av1：ffmpeg 各发行版普遍内置（libsvtav1 在 essentials 等精简版缺失，
      // 且其 "Unknown encoder" 会导致无输出/无日志）。质量用 crf（0-63，越低越好）。
      return { codec: "libaom-av1", qualityArg: "crf" };
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

// ==================== GIF 拆分 / 合成模式（v0.83）====================

/** 从文件名末尾解析数字序号；无数字返回 null。支持 1 / 01 / 001 等格式。 */
export function parseTrailingNumber(name: string): number | null {
  const base = name.replace(/\.[^.]+$/, "");
  const m = base.match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : null;
}

/** 按文件名末尾数字序号升序排序；无序号的图片排在前面（保持原相对顺序）。 */
export function sortByTrailingNumber<T extends { name: string }>(items: T[]): T[] {
  const numbered = items
    .map((item, i) => ({ item, i, num: parseTrailingNumber(item.name) }))
    .filter((x): x is { item: T; i: number; num: number } => x.num !== null)
    .sort((a, b) => a.num - b.num || a.i - b.i);
  const unnumbered = items
    .map((item, i) => ({ item, i, num: parseTrailingNumber(item.name) }))
    .filter((x) => x.num === null)
    .map((x) => x.item);
  return [...unnumbered, ...numbered.map((x) => x.item)];
}

/** 拆分模式命令：GIF → PNG 帧序列
 * - 输入：单个 GIF 文件
 * - 输出：`${dir}/${base}-%02d.png`（如 demo-01.png、demo-02.png…），
 *   由 ffmpeg 一次性写入全部帧；outputPattern 同时作为任务 outputPath（任务引擎不校验存在性）
 * - `-fps_mode vfr` 保留 GIF 全部帧（避免按固定 fps 丢帧）
 */
export function buildGifSplitArgs(
  input: string,
  outputDir: string,
): { args: string[]; outputPattern: string } {
  const base = input.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? "frame";
  const dir = outputDir || (input.match(/^(.+)[\\/]/)?.[1] ?? "");
  const outputPattern = `${dir}/${base}-%02d.png`;
  const args = ["-i", input, "-fps_mode", "vfr", outputPattern];
  return { args, outputPattern };
}

/** 合成模式命令：图片序列（已按序号排序）→ GIF
 * - 方案：concat demuxer + 临时列表文件（每行 `file '<path>'` + `duration <1/fps>`）
 *   ——concat 滤镜对多个单帧图片输入会丢帧（ffmpeg 已知问题），列表文件逐帧稳定可靠。
 * - colors<256 时 palettegen/paletteuse 限制颜色数
 * - `-loop <loop>`：0=无限循环，-1=不循环，N=循环 N 次
 * @param listPath 临时 concat 列表文件路径（调用方先用 write_text_file 写入内容）
 * @returns args 完整 ffmpeg 参数
 */
export function buildGifCombineArgs(
  listPath: string,
  output: string,
  loop: number,
  colors: number,
): string[] {
  const args = ["-f", "concat", "-safe", "0", "-i", listPath];
  if (colors < 256) {
    args.push(
      "-vf",
      "split[a][b];[a]palettegen=max_colors=" + colors + "[p];[b][p]paletteuse=dither=bayer",
    );
  }
  args.push("-loop", String(loop));
  args.push(output);
  return args;
}

/** 生成 concat 列表文件内容：每帧 `file '<path>'` + `duration <1/fps>` */
export function buildConcatListContent(paths: string[], fps: number): string {
  return paths
    .map((p) => {
      // ffmpeg 列表文件路径建议转正斜杠
      const q = p.replace(/\\/g, "/");
      const dur = (1 / fps).toFixed(6);
      return `file '${q}'\nduration ${dur}\n`;
    })
    .join("");
}