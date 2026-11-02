import { describe, it, expect } from "vitest";
import { formatMs, formatMsPrecise } from "./format";

describe("formatMs（整秒时长）", () => {
  it("秒级取整，无小数", () => {
    expect(formatMs(0)).toBe("00:00");
    expect(formatMs(59_000)).toBe("00:59");
    expect(formatMs(60_000)).toBe("01:00");
    expect(formatMs(3_600_000 + 5_000)).toBe("1:00:05");
  });
});

describe("formatMsPrecise（亚秒级时长）", () => {
  it("短于 1 秒的媒体显示毫秒，不再显示 00:00", () => {
    expect(formatMsPrecise(300)).toBe("00:00.300");
    expect(formatMsPrecise(0)).toBe("00:00");
  });

  it("超过 1 秒时也保留小数部分", () => {
    expect(formatMsPrecise(1500)).toBe("00:01.500");
  });

  it("整秒不带小数", () => {
    expect(formatMsPrecise(60_000)).toBe("01:00");
    expect(formatMsPrecise(3_600_000)).toBe("1:00:00");
  });
});
