import { describe, it, expect } from "vitest";
import { buildMultiConcatArgs, resolveConcatTarget } from "./builder";
import { defaultVideoParams } from "./types";

const v = () => ({ ...defaultVideoParams(), vcodec: "libx264" as const, scaleMode: 0 as const });
const a = () => ({ acodec: "aac" as const, bitrateK: 128, sampleRate: 48000, channels: 2, vbr: false as const, vbrQuality: 5 });

describe("多片段拼接命令构建（v0.85）", () => {
  it("生成多输入 + filter_complex trim/atrim + concat，强制重编码", () => {
    const segs = [
      { path: "C:/a.mp4", startSec: 0, endSec: 5, hasAudio: true },
      { path: "C:/b.mp4", startSec: 1, endSec: 4, hasAudio: true },
    ];
    const args = buildMultiConcatArgs(segs, "C:/out.mp4", v(), a(), { w: 1920, h: 1080, fps: 30, sampleRate: 48000, channels: 2 });
    // 两个 -i
    expect(args.filter((x) => x === "-i").length).toBe(2);
    const fc = args[args.indexOf("-filter_complex") + 1];
    expect(fc).toContain("[0:v]trim=start=0:end=5");
    expect(fc).toContain("[1:v]trim=start=1:end=4");
    expect(fc).toContain("[0:a]atrim=start=0:end=5");
    expect(fc).toContain("concat=n=2:v=1:a=0[vout]");
    expect(fc).toContain("concat=n=2:v=0:a=1[aout]");
    // 统一参数：scale/pad/fps/format
    expect(fc).toContain("scale=1920:1080:force_original_aspect_ratio=decrease");
    expect(fc).toContain("pad=1920:1080");
    expect(fc).toContain("fps=30");
    expect(fc).toContain("format=yuv420p");
    // 强制 -c:v libx264，绝不 copy
    expect(args).toContain("-c:v");
    expect(args[args.indexOf("-c:v") + 1]).toBe("libx264");
    expect(args).not.toContain("copy");
    expect(args[args.length - 1]).toBe("C:/out.mp4");
  });

  it("vcodec=copy 时强制回退 libx264", () => {
    const segs = [
      { path: "C:/a.mp4", startSec: 0, endSec: 2, hasAudio: true },
      { path: "C:/b.mp4", startSec: 0, endSec: 2, hasAudio: true },
    ];
    const args = buildMultiConcatArgs(segs, "C:/out.mp4", { ...v(), vcodec: "copy" as const }, a(), { w: 1280, h: 720, fps: 30, sampleRate: 48000, channels: 2 });
    expect(args[args.indexOf("-c:v") + 1]).toBe("libx264");
  });

  it("无音频片段：anullsrc 生成静音轨", () => {
    const segs = [
      { path: "C:/a.mp4", startSec: 0, endSec: 3, hasAudio: true },
      { path: "C:/mute.mp4", startSec: 0, endSec: 2, hasAudio: false },
    ];
    const args = buildMultiConcatArgs(segs, "C:/out.mp4", v(), a(), { w: 1280, h: 720, fps: 30, sampleRate: 48000, channels: 2 });
    const fc = args[args.indexOf("-filter_complex") + 1];
    expect(fc).toContain("anullsrc=r=48000:cl=stereo");
    expect(fc).toContain("atrim=start=0:end=2");
    expect(fc).toContain("aresample=48000,");
    expect(fc).toContain("concat=n=2:v=0:a=1[aout]");
  });

  it("片段数量 <2 抛错", () => {
    expect(() =>
      buildMultiConcatArgs([{ path: "C:/a.mp4", startSec: 0, endSec: 1, hasAudio: true }], "C:/o.mp4", v(), a(), { w: 1, h: 1, fps: 30, sampleRate: 48000, channels: 2 }),
    ).toThrow();
  });

  it("resolveConcatTarget：无用户缩放时以第一段分辨率，fps 默认 30，音频默认 48k 双声道", () => {
    const t = resolveConcatTarget({ width: 1280, height: 720 }, v(), a());
    expect(t).toEqual({ w: 1280, h: 720, fps: 30, sampleRate: 48000, channels: 2 });
  });

  it("resolveConcatTarget：用户 scaleMode=1 优先覆盖", () => {
    const t = resolveConcatTarget({ width: 3840, height: 2160 }, { ...v(), scaleMode: 1 as const, scaleW: 1920, scaleH: 1080 }, a());
    expect(t.w).toBe(1920);
    expect(t.h).toBe(1080);
  });
});