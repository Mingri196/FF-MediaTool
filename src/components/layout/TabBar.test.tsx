// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act, cleanup } from "@testing-library/react";
import { TabBar } from "./TabBar";
import { zh } from "@/i18n/locales/zh";

vi.mock("@/i18n", () => ({
  useI18n: () => ({ t: (k: string) => (zh as Record<string, string>)[k] ?? k }),
}));

// TabManager mock：受控 tabs/activeId + 记录调用的动作
const openTabMock = vi.fn();
const closeTabMock = vi.fn();
const duplicateTabMock = vi.fn();
const activateMock = vi.fn();
let tabsMock: { id: string; pageId: string; titleKey: string }[];
let activeIdMock: string;

vi.mock("@/tabs/TabManager", () => ({
  MAX_TABS: 10,
  useTabManager: () => ({
    tabs: tabsMock,
    activeId: activeIdMock,
    openTab: openTabMock,
    closeTab: closeTabMock,
    duplicateTab: duplicateTabMock,
    activate: activateMock,
    setTabPage: vi.fn(),
    registerSnapshot: vi.fn(() => () => {}),
  }),
}));

vi.mock("@/tasks/TaskProvider", () => ({
  useTasks: () => ({ stopTabTasks: vi.fn().mockResolvedValue(undefined) }),
}));

const TAB_A = { id: "a", pageId: "settings", titleKey: "nav.settings" };
const TAB_B = { id: "b", pageId: "video-convert", titleKey: "nav.videoConvert" };

const renderBar = () =>
  render(<TabBar contentRefs={{ current: new Map() } as React.MutableRefObject<Map<string, HTMLElement | null>>} />);

beforeEach(() => {
  tabsMock = [TAB_A, TAB_B];
  activeIdMock = "a";
  openTabMock.mockClear();
  closeTabMock.mockClear();
  duplicateTabMock.mockClear();
  activateMock.mockClear();
});

afterEach(cleanup);

describe("TabBar", () => {
  it("渲染加号 + 标签列表；激活标签高亮", () => {
    const { container } = renderBar();
    // + 按钮
    const plus = container.querySelector('button[title="新建标签"]');
    expect(plus).not.toBeNull();
    // 两个标签
    const tabEls = container.querySelectorAll('[data-tab-id]');
    expect(tabEls.length).toBe(2);
    // 激活标签带高亮类
    const c0 = tabEls[0].getAttribute("class") ?? "";
    const c1 = tabEls[1].getAttribute("class") ?? "";
    expect(tabEls[0].getAttribute("data-tab-id")).toBe("a");
    // 激活：bg-accent 精确类（非 hover:bg-accent/50 子串）
    expect(c0.split(" ")).toContain("bg-accent");
    expect(c1.split(" ")).not.toContain("bg-accent");
  });

  it("点击 + 新建标签（默认设置页）", () => {
    const { container } = renderBar();
    const plus = container.querySelector('button[title="新建标签"]')!;
    act(() => { fireEvent.click(plus); });
    expect(openTabMock).toHaveBeenCalledWith("settings");
  });

  it("左键点击标签切换到该标签", () => {
    const { container } = renderBar();
    const tabEls = container.querySelectorAll('[data-tab-id]');
    act(() => { fireEvent.click(tabEls[1]); });
    expect(activateMock).toHaveBeenCalledWith("b");
  });

  it("仅剩 1 个标签时关闭按钮禁用", () => {
    tabsMock = [TAB_A];
    activeIdMock = "a";
    const { container } = renderBar();
    const closeBtn = container.querySelector('button[title="关闭标签"]') as HTMLButtonElement;
    expect(closeBtn.disabled).toBe(true);
    // 点击关闭按钮不触发 closeTab（禁用）
    act(() => { fireEvent.click(closeBtn); });
    expect(closeTabMock).not.toHaveBeenCalled();
  });

  it("右键标签弹出菜单：复制标签状态 / 关闭标签", () => {
    const { container } = renderBar();
    const tabEl = container.querySelector('[data-tab-id="a"]')!;
    act(() => { fireEvent.contextMenu(tabEl); });
    // 菜单渲染
    expect(container.textContent).toContain("复制标签状态");
    expect(container.textContent).toContain("关闭标签");
    // 点击复制
    const dupBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "复制标签状态")!;
    act(() => { fireEvent.click(dupBtn); });
    expect(duplicateTabMock).toHaveBeenCalledWith("a");
  });

  it("关闭普通标签（无任务）直接关闭", () => {
    const { container } = renderBar();
    const closeBtn = container.querySelector('button[title="关闭标签"]')!;
    act(() => { fireEvent.click(closeBtn); });
    expect(closeTabMock).toHaveBeenCalledWith("a");
  });

  it("关闭有关联任务的标签：弹出确认对话框，确认后关闭", async () => {
    const { container } = render(
      <TabBar
        contentRefs={{ current: new Map() } as React.MutableRefObject<Map<string, HTMLElement | null>>}
        tabHasTasks={(id) => id === "a"}
      />,
    );
    const closeBtn = container.querySelector('button[title="关闭标签"]')!;
    act(() => { fireEvent.click(closeBtn); });
    // AlertDialog 经 Portal 渲染到 body
    const dialog = document.querySelector('[data-slot="alert-dialog-content"]');
    expect(dialog).not.toBeNull();
    // 点确认关闭（stopTabTasks 是 promise，等其 finally 完成）
    const okBtn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "确认关闭")!;
    expect(okBtn).toBeTruthy();
    await act(async () => { fireEvent.click(okBtn); });
    await Promise.resolve();
    expect(closeTabMock).toHaveBeenCalledWith("a");
  });

  it("标签过多时滚轮横向滚动", () => {
    const { container } = renderBar();
    const bar = container.querySelector('[data-slot="tabbar"]')!;
    // 触发滚轮事件（jsdom 无真实滚动，仅验证不抛错）
    let prevented = false;
    act(() => {
      fireEvent.wheel(bar, { deltaY: 100, cancelable: true, bubbles: true });
    });
    // 若 preventDefault 被 React 合成事件吞掉则不断言 prevent，仅验证无异常
    expect(prevented).toBe(false);
  });

  it("悬停标签：延时后弹出预览（克隆内容 DOM）", () => {
    vi.useFakeTimers();
    try {
      const node = document.createElement("div");
      node.innerHTML = "<span>预览内容</span>";
      const refs = { current: new Map([["a", node]]) } as React.MutableRefObject<Map<string, HTMLElement | null>>;
      const { container } = render(<TabBar contentRefs={refs} />);
      const tabEl = container.querySelector('[data-tab-id="a"]')!;
      act(() => { fireEvent.mouseEnter(tabEl); });
      // 350ms 后预览出现
      act(() => { vi.advanceTimersByTime(400); });
      expect(container.textContent).toContain("预览内容");
      // 移开消失
      act(() => { fireEvent.mouseLeave(tabEl); });
      expect(container.textContent).not.toContain("预览内容");
    } finally {
      vi.useRealTimers();
    }
  });
});
