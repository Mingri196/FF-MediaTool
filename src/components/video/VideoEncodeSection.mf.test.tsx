// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, fireEvent, act } from "@testing-library/react";
import { VideoEncodeSection } from "./VideoEncodeSection";
import { defaultVideoParams, defaultVideoAudioParams, type VideoParams } from "@/video/types";
import { zh } from "@/i18n/locales/zh";

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => zh[key as keyof typeof zh] ?? key,
  }),
}));

function Harness() {
  const [video, setVideo] = useState<VideoParams>(() => defaultVideoParams());
  return (
    <VideoEncodeSection
      video={video}
      audio={defaultVideoAudioParams()}
      onVideoChange={setVideo}
      onAudioChange={() => {}}
    />
  );
}

/** 切换视频编码器下拉到指定值（Base UI item 无 data-value，按文本匹配） */
function pickCodec(container: HTMLElement, text: string) {
  const triggers = Array.from(container.querySelectorAll('[data-slot="select-trigger"]'));
  // 每次先点开 trigger（关闭状态下 popup 不存在）
  act(() => {
    fireEvent.pointerDown(triggers[0] as HTMLElement);
    fireEvent.click(triggers[0] as HTMLElement);
  });
  const popup = document.querySelector('[data-slot="select-content"]') as HTMLElement;
  expect(popup).not.toBeNull();
  const item = Array.from(popup.querySelectorAll('[data-slot="select-item"]') ?? []).find(
    (el) => (el.textContent ?? "").includes(text),
  );
  expect(item).not.toBeUndefined();
  // Base UI 用 pointerdown 选中项
  act(() => {
    fireEvent.pointerDown(item as HTMLElement);
    fireEvent.pointerUp(item as HTMLElement);
    fireEvent.click(item as HTMLElement);
  });
}

describe("VideoEncodeSection h264_mf（Media Foundation）控件置灰", () => {
  const renderSection = () => render(<Harness />).container;

  it("选中 h264_mf：preset/tune 下拉禁用、显示提示文字", () => {
    const container = renderSection();
    pickCodec(container, "Media Foundation");

    const triggers = Array.from(container.querySelectorAll('[data-slot="select-trigger"]'));
    // 先确认编码器确实切到 h264_mf（items 映射后 SelectValue 渲染的是选中项标签而非原始 value）
    expect(triggers[0]!.textContent).toContain("H.264 (Media Foundation)");
    // 顺序：编码器(0) preset(1) tune(2) profile(3) level(4) pix_fmt(5)
    expect((triggers[1] as HTMLButtonElement).disabled).toBe(true); // preset 禁用
    expect((triggers[2] as HTMLButtonElement).disabled).toBe(true); // tune 禁用
    expect(container.textContent).toContain("仅支持码率控制"); // 提示文字
  });

  it("切回 libx264：preset/tune 恢复可用", () => {
    const container = renderSection();
    pickCodec(container, "Media Foundation");
    pickCodec(container, "libx264");

    const triggers = Array.from(container.querySelectorAll('[data-slot="select-trigger"]'));
    expect((triggers[1] as HTMLButtonElement).disabled).toBe(false);
    expect((triggers[2] as HTMLButtonElement).disabled).toBe(false);
    expect(container.textContent).not.toContain("仅支持码率控制");
  });

  it("默认 libx264 时 preset/tune 可用", () => {
    const container = renderSection();
    const triggers = Array.from(container.querySelectorAll('[data-slot="select-trigger"]'));
    expect((triggers[1] as HTMLButtonElement).disabled).toBe(false);
    expect((triggers[2] as HTMLButtonElement).disabled).toBe(false);
  });
});
