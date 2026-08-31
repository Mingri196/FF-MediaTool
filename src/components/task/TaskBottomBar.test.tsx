// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { TaskBottomBar } from "./TaskBottomBar";

vi.mock("@/i18n", () => ({
  useI18n: () => ({ t: (k: string) => k }),
}));

const guardAddTask = vi.fn();
vi.mock("@/tasks/TaskProvider", () => ({
  useTasks: () => ({
    tasks: new Map(),
    queueIds: [],
    currentId: null,
    stopping: false,
    logs: new Map(),
    guardAddTask,
    stopTask: vi.fn(),
    clearLog: vi.fn(),
    statusLabel: (s: string) => s,
  }),
}));

// LogView 渲染为带标题的壳，便于断言工具栏存在
vi.mock("./LogView", () => ({
  LogView: ({ expanded, onToggleExpanded }: { expanded: boolean; onToggleExpanded?: () => void }) => (
    <div data-testid="logview" data-expanded={String(expanded)} onClick={onToggleExpanded}>
      LogView
    </div>
  ),
  loadLogWidth: () => 420,
  persistLogWidth: () => {},
}));

vi.mock("./QuickTaskDialog", () => ({
  QuickTaskDialog: () => null,
}));

beforeEach(() => {
  guardAddTask.mockClear();
});

afterEach(() => {
  cleanup();
});

const renderBar = (state: "collapsed" | "expanded" | "hidden", onStateChange = vi.fn()) =>
  render(<TaskBottomBar state={state} onStateChange={onStateChange} />);

describe("TaskBottomBar 三态", () => {
  it("collapsed：渲染收起小条（高度 200px，日志展开=false）", () => {
    const { container } = renderBar("collapsed");
    expect(container.querySelector('[data-slot="taskbar"]')).not.toBeNull();
    const lv = container.querySelector('[data-testid="logview"]')!;
    expect(lv.getAttribute("data-expanded")).toBe("false");
  });

  it("expanded：渲染完整面板（高度 45% 窗口，日志展开=true）", () => {
    const { container } = renderBar("expanded");
    expect(container.querySelector('[data-slot="taskbar"]')).not.toBeNull();
    const lv = container.querySelector('[data-testid="logview"]')!;
    expect(lv.getAttribute("data-expanded")).toBe("true");
  });

  it("hidden：整个组件不渲染（面板直接消失，透明度随之不生效）", () => {
    const { container } = renderBar("hidden");
    expect(container.querySelector('[data-slot="taskbar"]')).toBeNull();
    expect(container.querySelector('[data-testid="logview"]')).toBeNull();
  });

  it("鼠标点击展开按钮（LogView 工具按钮）→ onStateChange 切换 收起↔展开", () => {
    const onChange = vi.fn();
    const { container } = renderBar("collapsed", onChange);
    fireEvent.click(container.querySelector('[data-testid="logview"]')!);
    expect(onChange).toHaveBeenCalledWith("expanded");
  });

  it("expanded 状态点击工具按钮 → onStateChange 收起", () => {
    const onChange = vi.fn();
    const { container } = renderBar("expanded", onChange);
    fireEvent.click(container.querySelector('[data-testid="logview"]')!);
    expect(onChange).toHaveBeenCalledWith("collapsed");
  });
});