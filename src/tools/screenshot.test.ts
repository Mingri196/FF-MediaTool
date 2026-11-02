import { describe, it, expect } from "vitest";
import {
  parseTimePoint,
  fmtStamp,
  screenshotOutName,
  buildScreenshotArgs,
} from "./screenshot";

describe("视频截图：时间点解析", () => {
  it("纯秒数", () => {
    expect(parseTimePoint("83.5")).toBe(83.5);
    expect(parseTimePoint("0")).toBe(0);
  });
  it("MM:SS", () => {
    expect(parseTimePoint("01:23")).toBe(83);
  });
  it("HH:MM:SS.mmm", () => {
    expect(parseTimePoint("01:23:45.5")).toBe(5025.5);
    expect(parseTimePoint("0:00:10")).toBe(10);
  });
  it("非法输入返回 null", () => {
    expect(parseTimePoint("")).toBeNull();
    expect(parseTimePoint("abc")).toBeNull();
    expect(parseTimePoint("1:2:3:4")).toBeNull();
    expect(parseTimePoint("-5")).toBeNull();
    expect(parseTimePoint("1:-2")).toBeNull();
  });
});

describe("视频截图：命名", () => {
  it("fmtStamp 冒号换连字符", () => {
    expect(fmtStamp(83.5)).toBe("00-01-23");
    expect(fmtStamp(5025)).toBe("01-23-45");
  });
  it("按时间点命名", () => {
    expect(screenshotOutName(83.5, 2, "jpg", "time")).toBe("截图_00-01-23.jpg");
  });
  it("按序号命名（按时间排序编号）", () => {
    expect(screenshotOutName(83.5, 0, "png", "seq")).toBe("截图_01.png");
    expect(screenshotOutName(2400, 9, "webp", "seq")).toBe("截图_10.webp");
  });
});

describe("视频截图：命令构建", () => {
  const base = { input: "D:\\in\\v.mp4", output: "D:\\opt\\v\\截图_00-01-23.jpg", timeSec: 83.5, format: "jpg" as const };

  it("JPG：-ss 前置 + 单帧 + 质量", () => {
    expect(buildScreenshotArgs({ ...base, quality: 4 })).toEqual([
      "-ss", "83.5", "-i", "D:\\in\\v.mp4", "-frames:v", "1", "-q:v", "4", "D:\\opt\\v\\截图_00-01-23.jpg",
    ]);
  });
  it("PNG：忽略质量参数", () => {
    const args = buildScreenshotArgs({ ...base, format: "png", quality: 4 });
    expect(args).not.toContain("-q:v");
  });
  it("限分辨率：带 scale 滤镜", () => {
    const args = buildScreenshotArgs({ ...base, maxHeight: 720 });
    expect(args).toContain("scale=-2:720");
  });
  it("保持原分辨率：无 -vf", () => {
    expect(buildScreenshotArgs(base)).not.toContain("-vf");
  });
});
