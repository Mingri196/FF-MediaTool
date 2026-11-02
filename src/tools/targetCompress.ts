/**
 * 目标压缩（独立工具）：输入目标文件体积，自动计算视频码率，两遍编码（2-pass）精准贴近目标。
 * 纯函数模块（vitest 单测）。
 *
 * 原理：
 * - 总码率 kbps = 目标字节 × 8 ÷ 1000 ÷ 时长秒
 * - 视频码率 = 总码率 − 音频码率，再留约 2% 容器开销余量
 * - 两遍编码：第 1 遍分析（输出到 null 混流器，无实际文件），第 2 遍按分析数据精准分配码率
 */

export interface TargetCompressOptions {
  /** 目标体积（MB），必须 ≥ 1 */
  targetMB: number;
  /** 视频时长（秒），必须 > 0 */
  durationSec: number;
  /** 音频码率（kbps）；0 表示移除音频 */
  audioKbps: number;
}

/** 视频码率下限（kbps），低于此值画质完全不可接受 */
export const MIN_VIDEO_KBPS = 64;
/** 容器开销余量（约 2%） */
export const OVERHEAD_FACTOR = 0.98;

/** 由目标体积计算视频码率；参数非法返回 null */
export function calcVideoBitrateKbps(opts: TargetCompressOptions): number | null {
  const { targetMB, durationSec, audioKbps } = opts;
  if (!Number.isFinite(targetMB) || targetMB < 1) return null;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return null;
  if (!Number.isFinite(audioKbps) || audioKbps < 0) return null;
  const totalKbps = (targetMB * 1024 * 1024 * 8) / 1000 / durationSec;
  return Math.max(MIN_VIDEO_KBPS, Math.round((totalKbps - audioKbps) * OVERHEAD_FACTOR));
}

/** 编码器预设（工具场景用 medium，速度与压缩率均衡） */
export const TARGET_COMPRESS_PRESET = "medium";

/** 目标压缩任务参数（两遍编码 = 队列里先后两个任务） */
export interface BuildTargetCompressArgsInput {
  input: string;
  output: string;
  videoKbps: number;
  /** 音频码率 kbps；0 = 移除音频 */
  audioKbps: number;
  /** passlogfile 基路径（ffmpeg 会在其后追加 -0.log 等后缀） */
  passlogPath: string;
}

/** 第 1 遍：分析（null 混流器丢弃输出，不产生实际文件） */
export function buildPass1Args(opts: BuildTargetCompressArgsInput): string[] {
  return [
    "-i", opts.input,
    "-c:v", "libx264",
    "-preset", TARGET_COMPRESS_PRESET,
    "-b:v", `${opts.videoKbps}k`,
    "-pass", "1",
    "-passlogfile", opts.passlogPath,
    "-an",
    "-f", "null",
    "-",
  ];
}

/** 第 2 遍：按第 1 遍分析数据重编码，输出最终文件 */
export function buildPass2Args(opts: BuildTargetCompressArgsInput): string[] {
  const audioArgs = opts.audioKbps > 0
    ? ["-c:a", "aac", "-b:a", `${opts.audioKbps}k`]
    : ["-an"];
  return [
    "-i", opts.input,
    "-c:v", "libx264",
    "-preset", TARGET_COMPRESS_PRESET,
    "-b:v", `${opts.videoKbps}k`,
    "-pass", "2",
    "-passlogfile", opts.passlogPath,
    ...audioArgs,
    opts.output,
  ];
}
