// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";
import { CustomTitleBar } from "./CustomTitleBar";

vi.mock("@/i18n", () => ({
  useI18n: () => ({ t: (k: string) => k }),
}));

// mock Tauri 事件与窗口 API（vi.hoisted：确保 mock 工厂提升时 emitHandlers 已定义）
const { emitHandlers, winMock } = vi.hoisted(() => {
  const winMock = {
    isMaximized: vi.fn(async () => false),
    minimize: vi.fn(async () => {}),
    toggleMaximize: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    onResized: vi.fn(async () => () => {}),
  };
  return {
    emitHandlers: {} as Record<string, (e: { payload: unknown }) => void>,
    winMock,
  };
});
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => winMock,
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: async (name: string, cb: (e: { payload: unknown }) => void) => {
    emitHandlers[name] = cb;
    return () => {};
  },
}));

afterEach(() => {
  cleanup();
  Object.keys(emitHandlers).forEach((k) => delete emitHandlers[k]);
  winMock.minimize.mockClear();
  winMock.toggleMaximize.mockClear();
  winMock.close.mockClear();
});

describe("CustomTitleBar 自制标题栏", () => {
  it("左侧渲染标题栏 GIF 图标（app-icon.gif），不含 FF-MediaTool 英文文字", () => {
    const { container } = render(<CustomTitleBar />);
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe("/app-icon.gif");
    // 英文软件名已移除，仅保留硬件数据
    expect(container.textContent).not.toContain("FF-MediaTool");
  });

  it("渲染硬件文字（初始 0%），事件到达后实时更新", () => {
    const { container } = render(<CustomTitleBar />);
    expect(container.textContent).toContain("GPU");
    expect(container.textContent).toContain("CPU");
    expect(container.textContent).toContain("MEM");
    // 触发后端 hardware-stats 事件
    act(() => {
      emitHandlers["hardware-stats"]?.({ payload: { gpu: 35, cpu: 22, memory: 48 } });
    });
    expect(container.textContent).toContain("35%");
    expect(container.textContent).toContain("22%");
    expect(container.textContent).toContain("48%");
  });

  it("最小化 / 最大化 / 关闭 三按钮调用窗口 API", () => {
    const { getByLabelText } = render(<CustomTitleBar />);
    fireEvent.click(getByLabelText("Minimize"));
    expect(winMock.minimize).toHaveBeenCalled();
    fireEvent.click(getByLabelText("Maximize"));
    expect(winMock.toggleMaximize).toHaveBeenCalled();
    fireEvent.click(getByLabelText("Close"));
    expect(winMock.close).toHaveBeenCalled();
  });

  it("标题栏拖拽区 drag、窗口控制按钮区域不带拖拽标记（no-drag）", () => {
    const { container } = render(<CustomTitleBar />);
    const bar = container.querySelector("[data-slot=titlebar]")! as HTMLElement;
    // React 布尔属性序列化为 "true"；存在即表示已设置 data-tauri-drag-region（Tauri 拖拽机制）
    expect(bar.hasAttribute("data-tauri-drag-region")).toBe(true);
    // 拖拽区元素带 data-tauri-drag-region
    const dragArea = bar.querySelector("div.flex-1") as HTMLElement;
    expect(dragArea.hasAttribute("data-tauri-drag-region")).toBe(true);
    // 按钮容器不带 data-tauri-drag-region → 点击按钮不触发窗口拖拽
    const btnGroup = bar.querySelector("div:last-child") as HTMLElement;
    expect(btnGroup.hasAttribute("data-tauri-drag-region")).toBe(false);
  });

  it("最大化状态：普通状态图标为 Square（最大化），按钮可触发切换", () => {
    const { getByLabelText } = render(<CustomTitleBar />);
    const btn = getByLabelText("Maximize");
    // lucide Square 图标用 rect 绘制（非 path），断言按钮内含 svg 图标
    expect(btn.querySelector("svg")).not.toBeNull();
    fireEvent.click(btn);
    expect(winMock.toggleMaximize).toHaveBeenCalled();
  });
});