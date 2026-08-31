// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { VideoEncodeSection } from "./VideoEncodeSection";
import { defaultVideoParams, defaultVideoAudioParams } from "@/video/types";
import { zh } from "@/i18n/locales/zh";

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => zh[key as keyof typeof zh] ?? key,
  }),
}));

describe("VideoEncodeSection 4 个下拉：自动(auto)闭合显示", () => {
  const video = defaultVideoParams();
  // 确保 4 个参数为默认空值（自动）
  const renderSection = () =>
    render(
      <VideoEncodeSection
        video={video}
        audio={defaultVideoAudioParams()}
        onVideoChange={() => {}}
        onAudioChange={() => {}}
      />,
    );

  it("优化方向 Tune、Profile、Level、像素格式 闭合下拉渲染『自动』占位文本", () => {
    const { container } = renderSection();
    const triggers = Array.from(
      container.querySelectorAll('[data-slot="select-trigger"]'),
    );

    // 找出 4 个目标下拉：Tune/Profile/Level/像素格式
    // trigger 顺序：编码器(0) preset(1) Tune(2) Profile(3) Level(4) 像素格式(5)
    const targetTriggers = triggers.slice(2, 6);
    expect(targetTriggers.length).toBe(4);

    for (const trig of targetTriggers) {
      // SelectValue 是 trigger 内的 data-slot="select-value"
      const value = trig.querySelector('[data-slot="select-value"]');
      expect(value).not.toBeNull();
      // 空值时应渲染 placeholder 文本「自动」
      expect(value!.textContent).toContain("自动");
    }
  });

  it("默认参数中 4 个字段为空串（代表自动）", () => {
    const v = defaultVideoParams();
    // tune/profile/level/pixFmt 默认应为空串
    expect(v.tune).toBe("");
    expect(v.profile).toBe("");
    expect(v.level).toBe("");
    expect(v.pixFmt).toBe("");
  });
});