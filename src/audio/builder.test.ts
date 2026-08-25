import { describe, expect, it } from "vitest";
import { buildAudioArgs, buildAudioFilterChain, fmtSec } from "./builder";
import { defaultAudioParams, type AudioParams } from "./types";

const INPUT = "C:\\music\\song.mp3";
const OUTPUT = "C:\\music\\out.flac";

function base(): AudioParams {
  return defaultAudioParams();
}

function build(overrides?: Partial<AudioParams>) {
  return buildAudioArgs({
    input: INPUT,
    output: OUTPUT,
    audio: { ...base(), ...overrides },
  });
}

describe("音频编码", () => {
  it("MP3 CBR 默认命令", () => {
    const args = build();
    expect(args).toContain("-vn");
    expect(args).toContain("-c:a");
    expect(args).toContain("libmp3lame");
    expect(args).toContain("-b:a");
    expect(args).toContain("192k");
    expect(args[args.length - 1]).toBe(OUTPUT);
  });

  it("VBR 模式输出 -q:a", () => {
    const args = build({ mode: "vbr", vbrQuality: 2 });
    expect(args).toContain("-q:a");
    expect(args).toContain("2");
    expect(args).not.toContain("-b:a");
  });

  it("无损模式不输出码率", () => {
    const args = build({ acodec: "flac", mode: "lossless" });
    expect(args).toContain("flac");
    expect(args).not.toContain("-b:a");
    expect(args).not.toContain("-q:a");
  });

  it("采样率/位深/声道参数", () => {
    const args = build({ sampleRate: 48000, bitDepth: 24, channels: 1 });
    expect(args).toContain("-ar");
    expect(args).toContain("48000");
    expect(args).toContain("-sample_fmt");
    expect(args).toContain("s32");
    expect(args).toContain("-ac");
    expect(args).toContain("1");
  });

  it("copy 模式不带任何编码参数", () => {
    const args = build({ acodec: "copy", mode: "cbr", bitrateK: 999, sampleRate: 44100 });
    expect(args).toContain("-c:a");
    expect(args).toContain("copy");
    expect(args).not.toContain("-b:a");
    expect(args).not.toContain("-ar");
    expect(args).not.toContain("-af");
  });
});

describe("音频滤镜链", () => {
  it("copy 模式忽略全部滤镜", () => {
    const p = base();
    p.acodec = "copy";
    expect(buildAudioFilterChain(p)).toBeNull();
  });

  it("音量/淡入淡出/归一化按序", () => {
    const p = base();
    p.gainDb = -3;
    p.fadeInSec = 2;
    p.fadeOutSec = 3;
    p.loudnorm = true;
    const chain = buildAudioFilterChain(p)!;
    const order = [chain.indexOf("volume="), chain.indexOf("afade=t=in"), chain.indexOf("afade=t=out"), chain.indexOf("loudnorm")];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(chain).toContain("volume=-3.0dB");
  });

  it("消人声与声道互换", () => {
    const p = base();
    p.vocalRemoval = true;
    p.channelMode = "swap";
    const chain = buildAudioFilterChain(p)!;
    expect(chain).toContain("pan=stereo|c0=c1|c1=c0");
    expect(chain).toContain("pan=stereo|c0=c0-c1|c1=c1-c0");
  });

  it("变速/混响/均衡器", () => {
    const p = base();
    p.tempo = 1.5;
    p.reverb = true;
    p.eqBass = 3;
    p.eqTreble = -2;
    const chain = buildAudioFilterChain(p)!;
    expect(chain).toContain("atempo=1.500");
    expect(chain).toContain("aecho=");
    expect(chain).toContain("bass=g=3.0");
    expect(chain).toContain("treble=g=-2.0");
  });
});

describe("截取 / 提取 / 拼接", () => {
  it("时间截取 -ss/-to 在 -i 前", () => {
    const args = buildAudioArgs({
      input: INPUT,
      output: OUTPUT,
      audio: base(),
      clip: { startSec: 10, endSec: 20 },
    });
    const iIdx = args.indexOf("-i");
    expect(args.slice(0, iIdx)).toContain("-ss");
    expect(args.slice(0, iIdx)).toContain("-to");
  });

  it("音轨提取 -map 0:a:1", () => {
    const args = buildAudioArgs({
      input: INPUT,
      output: OUTPUT,
      audio: base(),
      extract: { trackIndex: 1 },
    });
    expect(args).toContain("-map");
    expect(args).toContain("0:a:1");
  });

  it("多段拼接生成 concat 链", () => {
    const args = buildAudioArgs({
      input: INPUT,
      output: OUTPUT,
      audio: base(),
      concat: [
        { startSec: 0, endSec: 5 },
        { startSec: 10, endSec: 15 },
      ],
    });
    const fc = args[args.indexOf("-filter_complex") + 1];
    expect(fc).toContain("[0:a][1:a]concat=n=2:v=0:a=1[aout]");
    expect(args).toContain("-map");
    expect(args).toContain("[aout]");
  });

  it("fmtSec 格式", () => {
    expect(fmtSec(65.5)).toBe("1:05.500");
    expect(fmtSec(0)).toBe("0:00");
  });
});