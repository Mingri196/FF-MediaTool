import { describe, it, expect } from "vitest";
import {
  calcVideoBitrateKbps,
  buildPass1Args,
  buildPass2Args,
  TARGET_COMPRESS_PRESET,
} from "./targetCompress";

describe("目标压缩：码率计算", () => {
  it("100MB / 5025 秒 / 保留 128kbps 音频 → 扣除音频并留 2% 余量", () => {
    // 100MB = 100 * 1024 * 1024 * 8 bit = 838,860,800 bit → 838,860.8 kbit
    // 838860.8 / 5025 ≈ 166.94 kbps → (166.94 - 128) * 0.98 ≈ 38.2 → 低于下限 64
    expect(calcVideoBitrateKbps({ targetMB: 100, durationSec: 5025, audioKbps: 128 })).toBe(64);
  });

  it("常见场景：500MB / 600 秒 / 128kbps 音频", () => {
    // 500*1024*1024*8/1000/600 ≈ 6990.5 kbps → (6990.5-128)*0.98 ≈ 6725.3 → 6725
    expect(calcVideoBitrateKbps({ targetMB: 500, durationSec: 600, audioKbps: 128 })).toBe(6725);
  });

  it("移除音频时全部码率给视频", () => {
    const r = calcVideoBitrateKbps({ targetMB: 10, durationSec: 60, audioKbps: 0 });
    // 10*1024*1024*8/1000/60 ≈ 1398.1 → *0.98 ≈ 1370.1 → 1370
    expect(r).toBe(1370);
  });

  it("非法参数返回 null（体积 <1MB、时长 ≤0、负音频码率）", () => {
    expect(calcVideoBitrateKbps({ targetMB: 0, durationSec: 60, audioKbps: 128 })).toBeNull();
    expect(calcVideoBitrateKbps({ targetMB: 10, durationSec: 0, audioKbps: 128 })).toBeNull();
    expect(calcVideoBitrateKbps({ targetMB: 10, durationSec: -5, audioKbps: 128 })).toBeNull();
    expect(calcVideoBitrateKbps({ targetMB: 10, durationSec: 60, audioKbps: -1 })).toBeNull();
  });
});

describe("目标压缩：两遍命令构建", () => {
  const base = {
    input: "D:\\in\\video.mp4",
    output: "D:\\out\\video.mp4",
    videoKbps: 2500,
    audioKbps: 128,
    passlogPath: "D:\\out\\video.mp4.passlog",
  };

  it("第 1 遍：null 混流器、无音频、记录 passlogfile", () => {
    const args = buildPass1Args(base);
    expect(args).toEqual([
      "-i", "D:\\in\\video.mp4",
      "-c:v", "libx264",
      "-preset", TARGET_COMPRESS_PRESET,
      "-b:v", "2500k",
      "-pass", "1",
      "-passlogfile", "D:\\out\\video.mp4.passlog",
      "-an",
      "-f", "null",
      "-",
    ]);
  });

  it("第 2 遍：以 pass 2 重编码并写输出文件，保留音频", () => {
    const args = buildPass2Args(base);
    expect(args).toContain("-pass");
    expect(args[args.indexOf("-pass") + 1]).toBe("2");
    expect(args[args.length - 1]).toBe("D:\\out\\video.mp4");
    expect(args).toContain("-c:a");
    expect(args).toContain("128k");
  });

  it("移除音频时第 2 遍用 -an", () => {
    const args = buildPass2Args({ ...base, audioKbps: 0 });
    expect(args).toContain("-an");
    expect(args).not.toContain("-c:a");
  });
});
