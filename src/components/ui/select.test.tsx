// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

describe("Select 下拉弹窗宽度自适应", () => {
  it("弹窗使用 w-max（内容自适应宽度）而非固定锚点宽度，确保长文字不被截断", () => {
    const { container } = render(
      <Select value="yuv420p" onValueChange={() => {}}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">自动</SelectItem>
          <SelectItem value="yuv420p">YUV 4:2:0 8bit（最兼容）</SelectItem>
          <SelectItem value="yuv420p10le">YUV 4:2:0 10bit（HDR）</SelectItem>
          <SelectItem value="yuv444p10le">YUV 4:4:4 10bit（HDR）</SelectItem>
        </SelectContent>
      </Select>,
    );

    // 打开下拉
    const trigger = container.querySelector('[data-slot="select-trigger"]') as HTMLElement;
    act(() => {
      fireEvent.click(trigger);
    });

    // 找 Popup（portal 渲染到 body）
    const popup = document.querySelector('[data-slot="select-content"]') as HTMLElement;
    expect(popup).not.toBeNull();
    const cls = popup.className;
    // 核心修复：w-max（内容自适应宽度），min-w 用锚点宽度保证最小宽度
    expect(cls).toContain("w-max");
    expect(cls).toContain("min-w-(--anchor-width)");
    // 不应再是固定的锚点宽度 w-(--anchor-width)
    expect(cls).not.toContain(" w-(--anchor-width)");
  });

  it("下拉选项保持单行（whitespace-nowrap），不换行", () => {
    const { container } = render(
      <Select value="" onValueChange={() => {}}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="yuv420p10le">YUV 4:2:0 10bit（HDR）</SelectItem>
        </SelectContent>
      </Select>,
    );
    const trigger = container.querySelector('[data-slot="select-trigger"]') as HTMLElement;
    act(() => {
      fireEvent.click(trigger);
    });
    const item = document.querySelector('[data-slot="select-item"]') as HTMLElement;
    expect(item).not.toBeNull();
    // ItemText 有 flex whitespace-nowrap，保证单行展示
    expect(item.innerHTML).toContain("whitespace-nowrap");
  });
});
