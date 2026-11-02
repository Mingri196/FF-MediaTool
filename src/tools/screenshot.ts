/**
 * 视频截图（独立工具）：在时间轴上点选若干时间点，逐点导出高清截图。
 * 纯函数模块（vitest 单测）。
 *
 * 原理：
 * - 每个时间点一条 ffmpeg 命令：-ss 快速定位 → -frames:v 1 单帧 → 输出图片（秒级完成）
 * - 可选降分辨率 scale=-2:H（仅当源高于所选值时由调用方传入）
 * - JPG/WebP 受 -q:v 质量控制；PNG 为无损，忽略质量参数
 */

export type ScreenshotFormat = "jpg" | "png" | "webp";

/** 解析时间点输入：支持 "HH:MM:SS.mmm"、"MM:SS"、"纯秒数"；非法返回 null */
export function parseTimePoint(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) {
    const v = Number(t);
    return Number.isFinite(v) && v >= 0 ? v : null;
  }
  const parts = t.split(":").map((p) => Number(p));
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
  const [h, m, sec] = parts.length === 3 ? parts : [0, parts[0], parts[1]];
  const total = h * 3600 + m * 60 + sec;
  return Number.isFinite(total) && total >= 0 ? total : null;
}

/** 秒 → "HH-MM-SS"（用于按时间点命名文件，冒号换连字符避免 Windows 非法文件名） */
export function fmtStamp(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}-${String(m).padStart(2, "0")}-${String(s).padStart(2, "0")}`;
}

/** 输出文件名：按时间点（截图_HH-MM-SS.ext）或按序号（截图_01.ext，按时间排序编号） */
export function screenshotOutName(
  timeSec: number,
  seqIndex: number,
  format: ScreenshotFormat,
  naming: "time" | "seq",
): string {
  return naming === "seq"
    ? `截图_${String(seqIndex + 1).padStart(2, "0")}.${format}`
    : `截图_${fmtStamp(timeSec)}.${format}`;
}

export interface BuildScreenshotArgsInput {
  input: string;
  output: string;
  /** 截图时间点（秒） */
  timeSec: number;
  /** 输出格式 */
  format: ScreenshotFormat;
  /** -q:v 质量（JPG/WebP 有效；PNG 忽略） */
  quality?: number;
  /** 限制最大高度（px）；null/0/undefined = 保持原分辨率 */
  maxHeight?: number | null;
}

/** 单个时间点的截图命令 */
export function buildScreenshotArgs(o: BuildScreenshotArgsInput): string[] {
  const args = ["-ss", String(o.timeSec), "-i", o.input];
  if (o.maxHeight && o.maxHeight > 0) args.push("-vf", `scale=-2:${o.maxHeight}`);
  args.push("-frames:v", "1");
  if (o.format !== "png") args.push("-q:v", String(o.quality ?? 4));
  args.push(o.output);
  return args;
}
