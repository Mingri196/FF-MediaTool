import { describe, expect, it } from "vitest";
import { analyzeFfmpegError, isErrorLine } from "./ffmpegErrors";

describe("ffmpegErrors", () => {
  it("匹配未知编码器", () => {
    const r = analyzeFfmpegError("[ERROR] Unknown encoder 'libx265_foo'");
    expect(r.some((s) => s.pattern.source.includes("Unknown encoder"))).toBe(true);
  });

  it("匹配权限拒绝", () => {
    const r = analyzeFfmpegError("Permission denied: output.mp4");
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].suggestion).toContain("写入权限");
  });

  it("空字符串不匹配", () => {
    expect(analyzeFfmpegError("")).toHaveLength(0);
  });

  it("正常日志不匹配", () => {
    expect(analyzeFfmpegError("frame=  123 fps=30.0 q=28.0 size=    1024kB time=00:00:04.00")).toHaveLength(0);
  });

  it("匹配硬件加速失败", () => {
    const r = analyzeFfmpegError("Hardware device failed: cannot open encoder");
    expect(r.length).toBeGreaterThan(0);
  });

  it("isErrorLine 判断正确", () => {
    expect(isErrorLine("error: something")).toBe("error");
    expect(isErrorLine("Warning: deprecated option")).toBe("warning");
    expect(isErrorLine("frame= 123 fps=30")).toBeNull();
  });
});