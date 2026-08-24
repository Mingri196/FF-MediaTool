import { describe, expect, it } from "vitest";
import {
  buildVideoArgs,
  fmtSec,
  parseTimeToSec,
  type ClipRange,
} from "./builder";
import {
  defaultVideoAudioParams,
  defaultVideoParams,
  type VideoParams,
} from "./types";

const INPUT = "C:\\videos\\input.mp4";
const OUTPUT = "C:\\videos\\out.mp4";

function base(): VideoParams {
  return defaultVideoParams();
}

function build(overrides?: Partial<VideoParams>, clip?: ClipRange | null) {
  return buildVideoArgs({
    input: INPUT,
    output: OUTPUT,
    video: { ...base(), ...overrides },
    audio: defaultVideoAudioParams(),
    clip: clip ?? null,
  });
}

describe("buildVideoArgs 基础", () => {
  it("默认参数生成 H.264 CRF 命令", () => {
    const args = build();
    expect(args).toContain("-i");
    expect(args).toContain(INPUT);
    expect(args).toContain("-c:v");
    expect(args).toContain("libx264");
    expect(args).toContain("-crf");
    expect(args).toContain("23");
    expect(args).toContain("-preset");
    expect(args).toContain("medium");
    expect(args).toContain("-c:a");
    expect(args).toContain("aac");
    expect(args).toContain("-movflags");
    expect(args).toContain("+faststart");
    expect(args[args.length - 1]).toBe(OUTPUT);
  });

  it("ABR 模式输出码率", () => {
    const args = build({ qualityMode: "abr", bitrateK: 2000 });
    expect(args).toContain("-b:v");
    expect(args).toContain("2000k");
    expect(args).not.toContain("-crf");
  });

  it("CBR 模式输出 maxrate/bufsize", () => {
    const args = build({ qualityMode: "cbr", bitrateK: 2500, maxrateK: 2500, bufsizeK: 5000 });
    expect(args).toContain("-maxrate");
    expect(args).toContain("2500k");
    expect(args).toContain("-bufsize");
    expect(args).toContain("5000k");
  });

  it("copy 模式只输出 -c:v copy，不带任何编码参数", () => {
    const args = build({
      vcodec: "copy",
      crf: 1,
      preset: "placebo",
      tune: "film",
      pixFmt: "yuv420p",
    });
    expect(args).toContain("-c:v");
    expect(args).toContain("copy");
    expect(args).not.toContain("-crf");
    expect(args).not.toContain("-preset");
    expect(args).not.toContain("-tune");
    expect(args).not.toContain("-pix_fmt");
  });
});

describe("时间裁剪与格式", () => {
  it("-ss/-to 放在 -i 之前", () => {
    const args = build({}, { startSec: 10, endSec: 20.5 });
    const iIdx = args.indexOf("-i");
    expect(args.slice(0, iIdx)).toContain("-ss");
    expect(args.slice(0, iIdx)).toContain("-to");
  });

  it("fmtSec 与 parseTimeToSec 互逆", () => {
    for (const s of [0, 1.5, 65, 3600, 3723.123]) {
      expect(parseTimeToSec(fmtSec(s))).toBeCloseTo(s, 2);
    }
  });

  it("parseTimeToSec 解析各格式", () => {
    expect(parseTimeToSec("83.5")).toBeCloseTo(83.5);
    expect(parseTimeToSec("01:23.500")).toBeCloseTo(83.5);
    expect(parseTimeToSec("1:02:03")).toBeCloseTo(3723);
    expect(parseTimeToSec("abc")).toBeNull();
  });
});

describe("滤镜链", () => {
  it("多滤镜按顺序拼接", () => {
    const args = build({
      crop: { w: 640, h: 360, x: 0, y: 0 },
      scaleMode: 2,
      scaleWidth: 1280,
      rotate: "90",
      denoise: true,
      sharpen: 1.2,
      brightness: 0.1,
      contrast: 1.1,
      saturation: 1.2,
    });
    const vfIdx = args.indexOf("-vf");
    expect(vfIdx).toBeGreaterThan(-1);
    const chain = args[vfIdx + 1];
    expect(chain).toContain("crop=640:360:0:0");
    expect(chain).toContain("scale=1280:-2");
    expect(chain).toContain("transpose=1");
    expect(chain).toContain("hqdn3d");
    expect(chain).toContain("unsharp");
    expect(chain).toContain("eq=brightness=0.10:contrast=1.10:saturation=1.20");
    // 顺序检查
    const order = [chain.indexOf("crop"), chain.indexOf("scale"), chain.indexOf("transpose"), chain.indexOf("hqdn3d")];
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("字幕路径转义（反斜杠双写、冒号转义、空格保留）", () => {
    const args = build({ subtitles: { file: "C:\\subs\\my sub.srt" } });
    const chain = args[args.indexOf("-vf") + 1];
    expect(chain).toContain("subtitles=C\\:\\\\subs\\\\my sub.srt");
  });

  it("去黑边用 cropDetected 优先", () => {
    const args = build({
      crop: { w: 100, h: 100, x: 0, y: 0 },
      cropDetected: { w: 800, h: 450, x: 10, y: 20 },
    });
    const chain = args[args.indexOf("-vf") + 1];
    expect(chain).toContain("crop=800:450:10:20");
    expect(chain).not.toContain("crop=100:100");
  });

  it("水印走 filter_complex 双输入", () => {
    const args = build({
      watermark: { image: "C:\\logo.png", x: "10", y: "10", w: 120, opacity: 0.7 },
      scaleMode: 2,
      scaleWidth: 1280,
    });
    expect(args).toContain("-i");
    expect(args).toContain("C:\\logo.png");
    const fcIdx = args.indexOf("-filter_complex");
    expect(fcIdx).toBeGreaterThan(-1);
    const fc = args[fcIdx + 1];
    expect(fc).toContain("[1:v]scale=120:-1,format=rgba,colorchannelmixer=aa=0.700[wmk]");
    expect(fc).toContain("[0:v]scale=1280:-2[vmain]");
    expect(fc).toContain("[vmain][wmk]overlay=10:10[vout]");
    expect(args).toContain("-map");
    expect(args).toContain("[vout]");
  });

  it("无水印时不用 filter_complex", () => {
    const args = build({ denoise: true });
    expect(args).not.toContain("-filter_complex");
  });

  it("copy 模式忽略全部滤镜", () => {
    const args = build({
      vcodec: "copy",
      denoise: true,
      rotate: "90",
      brightness: 0.5,
    });
    expect(args).not.toContain("-vf");
    expect(args).not.toContain("-filter_complex");
  });
});

describe("多片段拼接", () => {
  it("2 段拼接生成 concat filter", () => {
    const args = buildVideoArgs({
      input: INPUT,
      output: "C:\\videos\\joined.mp4",
      video: defaultVideoParams(),
      audio: defaultVideoAudioParams(),
      concat: [
        { startSec: 0, endSec: 10 },
        { startSec: 20, endSec: 30 },
      ],
    });
    const fc = args[args.indexOf("-filter_complex") + 1];
    expect(fc).toContain("[0:v][1:v]concat=n=2:v=1:a=0[vout]");
    expect(fc).toContain("[0:a][1:a]concat=n=2:v=0:a=1[aout]");
    expect(args).toContain("-map");
    expect(args).toContain("[vout]");
    expect(args).toContain("-map");
    expect(args).toContain("[aout]");
  });

  it("超过 8 段报错", () => {
    const ranges: ClipRange[] = Array.from({ length: 9 }, (_, i) => ({ startSec: i, endSec: i + 1 }));
    expect(() =>
      buildVideoArgs({
        input: INPUT,
        output: OUTPUT,
        video: defaultVideoParams(),
        audio: defaultVideoAudioParams(),
        concat: ranges,
      }),
    ).toThrow();
  });
});

describe("音频参数", () => {
  it("音频 copy 不带码率", () => {
    const args = build({}, null);
    void args;
    const res = buildVideoArgs({
      input: INPUT,
      output: OUTPUT,
      video: defaultVideoParams(),
      audio: { acodec: "copy", bitrateK: 128, sampleRate: 0, channels: 0 },
    });
    const aIdx = res.indexOf("-c:a");
    expect(res[aIdx + 1]).toBe("copy");
    expect(res.slice(aIdx)).not.toContain("-b:a");
  });

  it("-an 禁用音频", () => {
    const res = buildVideoArgs({
      input: INPUT,
      output: OUTPUT,
      video: defaultVideoParams(),
      audio: { acodec: "none", bitrateK: 0, sampleRate: 0, channels: 0 },
    });
    expect(res).toContain("-an");
  });
});