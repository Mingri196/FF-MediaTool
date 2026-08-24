/**
 * 视频 ffmpeg 命令行 builder（纯函数，vitest 单测）。
 * 输入：VideoParams（编码/质量/高级/滤镜）+ VideoAudioParams + 剪辑区间。
 * 输出：完整 args 数组（不含可执行文件与自动附加的 -y/-nostats/-progress）。
 *
 * 规则：
 * - vcodec=copy 时，需要重编码的参数与滤镜一律不输出（前端同步灰化）
 * - 无滤镜走 -vf；有水印走 filter_complex（第二输入为水印图，支持缩放+透明度）
 * - 时间裁剪：-ss/-to 放在 -i 前（快速 seek，关键帧精度）
 * - 路径转义：Windows 反斜杠/冒号在滤镜内转义
 */
import type {
  VideoAudioParams,
  VideoParams,
  WatermarkCfg,
} from "./types";

/** 时间裁剪区间（秒；endSec=-1 到结尾） */
export interface ClipRange {
  startSec: number;
  endSec: number;
}

export interface BuildVideoArgsInput {
  input: string;
  output: string;
  video: VideoParams;
  audio: VideoAudioParams;
  clip?: ClipRange | null;
  /** 多片段拼接区间（≥2 段；与 clip 互斥） */
  concat?: ClipRange[] | null;
}

const isCopy = (v: VideoParams) => v.vcodec === "copy";

/** 滤镜路径转义（Windows 路径在滤镜链内的写法） */
export function escapeFilterPath(path: string): string {
  return path.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
}

/** 编码器与质量控制参数 */
function codecArgs(v: VideoParams, out: string[]): void {
  out.push("-c:v", v.vcodec);
  if (isCopy(v)) return;
  switch (v.qualityMode) {
    case "crf":
      out.push("-crf", String(v.crf));
      break;
    case "abr":
      out.push("-b:v", `${v.bitrateK}k`);
      break;
    case "cbr": {
      const br = v.bitrateK;
      out.push(
        "-b:v", `${br}k`,
        "-maxrate", `${v.maxrateK || br}k`,
        "-bufsize", `${v.bufsizeK || br * 2}k`,
      );
      break;
    }
  }
  out.push("-preset", v.preset);
  if (v.tune) out.push("-tune", v.tune);
  if (v.profile) out.push("-profile:v", v.profile);
  if (v.level) out.push("-level:v", v.level);
  if (v.pixFmt) out.push("-pix_fmt", v.pixFmt);
  if (v.fps > 0) out.push("-r", String(v.fps));
  if (v.gop > 0) out.push("-g", String(v.gop));
  if (v.bframes >= 0) out.push("-bf", String(v.bframes));
  if (v.refs > 0) out.push("-refs", String(v.refs));
  if (!v.scThreshold) out.push("-sc_threshold", "0");
}

/**
 * 主滤镜链（除水印外的全部单输入滤镜）。
 * 顺序：crop → scale → rotate/flip → denoise → sharpen → eq → subtitles
 */
export function buildMainFilterChain(v: VideoParams): string | null {
  if (isCopy(v)) return null;
  const parts: string[] = [];
  const effectiveCrop = v.cropDetected ?? v.crop;
  if (effectiveCrop) parts.push(`crop=${effectiveCrop.w}:${effectiveCrop.h}:${effectiveCrop.x}:${effectiveCrop.y}`);
  if (v.scaleMode === 1) parts.push(`scale=${v.scaleW}:${v.scaleH}`);
  if (v.scaleMode === 2) parts.push(`scale=${v.scaleWidth}:-2`);
  const roto: string[] = [];
  switch (v.rotate) {
    case "90": roto.push("transpose=1"); break;
    case "180": roto.push("hflip,vflip"); break;
    case "270": roto.push("transpose=2"); break;
    case "custom": roto.push(`rotate=${((v.rotateDeg * Math.PI) / 180).toFixed(4)}:c=black`); break;
    default: break;
  }
  if (v.flip === "h") roto.push("hflip");
  if (v.flip === "v") roto.push("vflip");
  if (roto.length) parts.push(roto.join(","));
  if (v.denoise) parts.push("hqdn3d=4:3:6:4.5");
  if (v.sharpen > 0) parts.push(`unsharp=5:5:${v.sharpen.toFixed(1)}:5:5:0`);
  const eqParts: string[] = [];
  if (v.brightness !== 0) eqParts.push(`brightness=${v.brightness.toFixed(2)}`);
  if (v.contrast !== 1) eqParts.push(`contrast=${v.contrast.toFixed(2)}`);
  if (v.saturation !== 1) eqParts.push(`saturation=${v.saturation.toFixed(2)}`);
  if (eqParts.length) parts.push(`eq=${eqParts.join(":")}`);
  if (v.subtitles) parts.push(`subtitles=${escapeFilterPath(v.subtitles.file)}`);
  return parts.length ? parts.join(",") : null;
}

/** 水印 → filter_complex 片段：[1:v]scale?/format? 后直接接 [wmk] label */
function watermarkChain(w: WatermarkCfg): string {
  const filters: string[] = [];
  if (w.w > 0) filters.push(`scale=${w.w}:-1`);
  if (w.opacity < 1) filters.push(`format=rgba,colorchannelmixer=aa=${w.opacity.toFixed(3)}`);
  return `[1:v]${filters.join(",")}[wmk]`;
}

/** 汇总滤镜部分：无滤镜→null；主链-only→-vf；水印→filter_complex */
export function filterArgs(v: VideoParams, out: string[]): void {
  if (isCopy(v)) return;
  const mainChain = buildMainFilterChain(v);
  if (!v.watermark) {
    if (mainChain) out.push("-vf", mainChain);
    return;
  }
  // 水印：第二输入 + filter_complex（主链打包成 [vmain] 再与 [wmk] overlay）
  const wm = v.watermark;
  out.push("-i", wm.image);
  const fcParts: string[] = [watermarkChain(wm)];
  if (mainChain) fcParts.push(`[0:v]${mainChain}[vmain]`);
  const src = mainChain ? "[vmain][wmk]" : "[0:v][wmk]";
  fcParts.push(`${src}overlay=${wm.x}:${wm.y}[vout]`);
  out.push("-filter_complex", fcParts.join(";"), "-map", "[vout]");
}

/** 音频参数 */
function audioArgs(a: VideoAudioParams, out: string[]): void {
  if (a.acodec === "none") {
    out.push("-an");
    return;
  }
  out.push("-c:a", a.acodec);
  if (a.acodec === "copy") return;
  if (a.bitrateK > 0) out.push("-b:a", `${a.bitrateK}k`);
  if (a.sampleRate > 0) out.push("-ar", String(a.sampleRate));
  if (a.channels > 0) out.push("-ac", String(a.channels));
}

/** 多片段拼接参数（≤8 段；滤镜不参与拼接链） */
function concatArgs(inPath: string, ranges: ClipRange[], output: string, v: VideoParams, a: VideoAudioParams): string[] {
  if (ranges.length < 2 || ranges.length > 8) {
    throw new Error("多片段拼接需要 2~8 段");
  }
  const out: string[] = [];
  let vLabels = "";
  let aLabels = "";
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    const dur = r.endSec > 0 ? r.endSec - r.startSec : undefined;
    out.push("-ss", fmtSec(r.startSec));
    if (dur !== undefined && dur > 0) out.push("-t", fmtSec(dur));
    out.push("-i", inPath);
    vLabels += `[${i}:v]`;
    aLabels += `[${i}:a]`;
  }
  out.push(
    "-filter_complex",
    `${vLabels}concat=n=${ranges.length}:v=1:a=0[vout];${aLabels}concat=n=${ranges.length}:v=0:a=1[aout]`,
    "-map", "[vout]", "-map", "[aout]",
  );
  codecArgs(v, out);
  audioArgs(a, out);
  if (output.toLowerCase().endsWith(".mp4") || output.toLowerCase().endsWith(".m4v")) {
    out.push("-movflags", "+faststart");
  }
  out.push(output);
  return out;
}

/**
 * 主入口。注意：带水印时调用方需确保 watermark.image 存在；
 * copy 模式自动忽略全部滤镜。
 */
export function buildVideoArgs(input: BuildVideoArgsInput): string[] {
  const { input: inPath, output, video, audio, clip, concat } = input;

  if (concat && concat.length >= 2) {
    return concatArgs(inPath, concat, output, video, audio);
  }

  const out: string[] = [];
  if (clip) {
    out.push("-ss", fmtSec(clip.startSec));
    if (clip.endSec > 0) out.push("-to", fmtSec(clip.endSec));
  }
  out.push("-i", inPath);

  codecArgs(video, out);
  filterArgs(video, out);
  audioArgs(audio, out);

  const ext = output.toLowerCase().split(".").pop() ?? "";
  if (ext === "mp4" || ext === "m4v") out.push("-movflags", "+faststart");
  out.push(output);
  return out;
}

/** 秒 → ffmpeg 时间串（h:mm:ss.mmm / m:ss.mmm） */
export function fmtSec(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const whole = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const base = h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(whole).padStart(2, "0")}`
    : `${m}:${String(whole).padStart(2, "0")}`;
  return ms > 0 ? `${base}.${String(ms).padStart(3, "0")}` : base;
}

/** 时间字符串 → 秒（"83.5" / "01:23.500" / "1:02:03"） */
export function parseTimeToSec(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) {
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : null;
  }
  const m = t.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (!m) return null;
  const h = m[1] ? parseInt(m[1], 10) : 0;
  const min = parseInt(m[2], 10);
  const sec = parseInt(m[3], 10);
  const frac = m[4] ? parseInt(m[4].padEnd(3, "0"), 10) / 1000 : 0;
  return h * 3600 + min * 60 + sec + frac;
}