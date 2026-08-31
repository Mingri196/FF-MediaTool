// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { VideoEncodeSection } from "./VideoEncodeSection";
import { defaultVideoParams, defaultVideoAudioParams } from "@/video/types";
import { en } from "@/i18n/locales/en";

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => en[key as keyof typeof en] ?? key,
  }),
}));

describe("VideoEncodeSection 像素格式下拉（英文）", () => {
  it("打开像素格式下拉，全部英文选项文字完整渲染", () => {
    const { container } = render(
      <VideoEncodeSection
        video={defaultVideoParams()}
        audio={defaultVideoAudioParams()}
        onVideoChange={() => {}}
        onAudioChange={() => {}}
      />,
    );

    // 找所有下拉触发按钮，像素格式的触发按钮文本为空（未选中）——按顺序第 7 个下拉
    const triggers = Array.from(
      container.querySelectorAll('[data-slot="select-trigger"]'),
    );
    // 编码器、质量模式无下拉、预设、Tune、Profile、Level、像素格式
    // 触发按钮顺序：编码器(1) 预设(2) Tune(3) Profile(4) Level(5) 像素格式(6)
    const pixTrigger = triggers[5] as HTMLElement;
    expect(pixTrigger).not.toBeNull();

    act(() => {
      fireEvent.click(pixTrigger);
    });

    const popup = document.querySelector('[data-slot="select-content"]') as HTMLElement;
    expect(popup).not.toBeNull();

    // 英文像素格式选项应完整存在于弹窗
    const englishOptions = [
      "Auto",
      "YUV 4:2:0 8-bit (most compatible)",
      "YUV 4:2:2 8-bit",
      "YUV 4:4:4 8-bit",
      "YUV 4:2:0 10-bit (HDR)",
      "YUV 4:2:2 10-bit",
      "YUV 4:4:4 10-bit (HDR)",
    ];
    const popupText = popup.textContent || "";
    for (const opt of englishOptions) {
      expect(popupText).toContain(opt);
    }
    // 弹窗宽度类为内容自适应
    expect(popup.className).toContain("w-max");
  });
});