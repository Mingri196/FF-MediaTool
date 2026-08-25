/**
 * 音频 ffmpeg 命令行 builder（纯函数，vitest 单测）。
 *
 * 规则：
 * - acodec=copy 时不输出任何编码参数与滤镜（前端同步灰化）
 * - 滤镜链顺序：volume → fade → loudnorm → 声道处理 → 降噪 → 消人声 → tempo → reverb → EQ
 * - 音轨提取：`-map 0:a:<n>`（-1 表示全部音频流）
 * - 分割/拼接由调用方生成多个任务（分割）或 concat filter（拼接）
 */
import type { AudioExtractParams, AudioParams } from "./types";

export interface AudioSegment {
  startSec: number;
  endSec: number; // -1 = 到结尾
}

export interface BuildAudioArgsInput {
  input: string;
  output: string;
  audio: AudioParams;
  /** 时间截取 */
  clip?: AudioSegment | null;
  /** 多段拼接（≥2 段） */
  concat?: AudioSegment[] | null;
  /** 从视频提取音轨 */
  extract?: AudioExtractParams | null;
}

const isCopy = (a: AudioParams) => a.acodec === "copy";

/** 编码参数 */
export function encodeArgs(a: AudioParams, out: string[]): void {
  out.push("-c:a", a.acodec);
  if (isCopy(a)) return;
  switch (a.mode) {
    case "cbr":
      if (["flac", "wavpack", "pcm_s16le", "pcm_s24le"].includes(a.acodec)) {
        // 无损编码器无码率概念
      } else if (a.bitrateK > 0) {
        out.push("-b:a", `${a.bitrateK}k`);
      }
      break;
    case "vbr":
      // libmp3lame/libvorbis/opus 用 -q:a；aac 用 -q:a 也可（caa 的 vbr）
      if (a.acodec !== "flac" && a.acodec !== "wavpack" && a.acodec !== "pcm_s16le" && a.acodec !== "pcm_s24le") {
        out.push("-q:a", String(a.vbrQuality));
      }
      break;
    case "lossless":
      break; // 无损编码器本身即无损
  }
  if (a.sampleRate > 0) out.push("-ar", String(a.sampleRate));
  if (a.bitDepth > 0) {
    // 位深映射到采样格式：s16/s32 等（按编码器）
    out.push("-sample_fmt", bitDepthToSampleFmt(a.bitDepth));
  }
  if (a.channels > 0) out.push("-ac", String(a.channels));
}

function bitDepthToSampleFmt(bits: number): string {
  switch (bits) {
    case 16:
      return "s16";
    case 24:
      return "s32"; // ffmpeg 以 s32 承载 24bit（pcm_s24le 编码器直接支持 s32 由输出层处理）
    case 32:
      return "s32";
    default:
      return "s16";
  }
}

/** 音频滤镜链 */
export function buildAudioFilterChain(a: AudioParams): string | null {
  if (isCopy(a)) return null;
  const parts: string[] = [];
  if (a.gainDb !== 0) parts.push(`volume=${a.gainDb.toFixed(1)}dB`);
  if (a.fadeInSec > 0) parts.push(`afade=t=in:st=0:d=${a.fadeInSec.toFixed(2)}`);
  if (a.fadeOutSec > 0) parts.push(`afade=t=out:st=${a.fadeOutSec.toFixed(2)}:d=1`);
  if (a.loudnorm) parts.push("loudnorm=I=-16:TP=-1.5:LRA=11");
  switch (a.channelMode) {
    case "swap":
      parts.push("pan=stereo|c0=c1|c1=c0");
      break;
    case "mono":
      parts.push("pan=mono|c0=0.5*c0+0.5*c1");
      break;
    case "stereo-upmix":
      parts.push("pan=stereo|c0=c0|c1=c0");
      break;
    case "downmix":
      parts.push("pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1");
      break;
    default:
      break;
  }
  if (a.denoise) parts.push("afftdn=nf=-25");
  if (a.vocalRemoval) parts.push("pan=stereo|c0=c0-c1|c1=c1-c0");
  if (a.tempo !== 1) parts.push(`atempo=${a.tempo.toFixed(3)}`);
  if (a.reverb) parts.push("aecho=0.8:0.88:60|120:0.3|0.2");
  const eqParts: string[] = [];
  if (a.eqBass !== 0) eqParts.push(`bass=g=${a.eqBass.toFixed(1)}`);
  if (a.eqMid !== 0) eqParts.push(`equalizer=f=1000:t=q:w=1:g=${a.eqMid.toFixed(1)}`);
  if (a.eqTreble !== 0) eqParts.push(`treble=g=${a.eqTreble.toFixed(1)}`);
  if (eqParts.length) parts.push(eqParts.join(","));
  return parts.length ? parts.join(",") : null;
}

/** 多段拼接（≤8 段，filter_complex concat） */
function concatArgs(
  input: string,
  segments: AudioSegment[],
  output: string,
  a: AudioParams,
): string[] {
  if (segments.length < 2 || segments.length > 8) {
    throw new Error("多段拼接需要 2~8 段");
  }
  const out: string[] = [];
  let labels = "";
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    out.push("-ss", fmtSec(s.startSec));
    if (s.endSec > 0) out.push("-t", fmtSec(s.endSec - s.startSec));
    out.push("-i", input);
    labels += `[${i}:a]`;
  }
  out.push(
    "-filter_complex",
    `${labels}concat=n=${segments.length}:v=0:a=1[aout]`,
    "-map", "[aout]",
  );
  encodeArgs(a, out);
  out.push(output);
  return out;
}

/** 主入口 */
export function buildAudioArgs(input: BuildAudioArgsInput): string[] {
  const { input: inPath, output, audio, clip, concat, extract } = input;
  const out: string[] = [];

  if (concat && concat.length >= 2) {
    return concatArgs(inPath, concat, output, audio);
  }

  if (clip) {
    out.push("-ss", fmtSec(clip.startSec));
    if (clip.endSec > 0) out.push("-to", fmtSec(clip.endSec));
  }
  out.push("-i", inPath);
  out.push("-vn"); // 纯音频输出

  // 音轨提取：-map 指定音频流
  if (extract && extract.trackIndex >= 0) {
    out.push("-map", `0:a:${extract.trackIndex}`);
  }

  encodeArgs(audio, out);

  const filterChain = buildAudioFilterChain(audio);
  if (filterChain) out.push("-af", filterChain);

  out.push(output);
  return out;
}

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