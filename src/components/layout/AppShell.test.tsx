// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act, cleanup } from "@testing-library/react";
import { AppShell, NAV_ITEMS } from "./AppShell";
import { registerDialogClose, resetDialogStack } from "@/lib/dialogRegistry";

// 模拟 useI18n：返回 key 本身即可
vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

// 模拟 TaskBottomBar：记录收到的三态 props，便于 Tab 快捷键断言
const taskbarStateMock = vi.fn();
let taskbarStateValue: string | null = null;
vi.mock("@/components/task/TaskBottomBar", () => ({
  TaskBottomBar: ({ state, onStateChange, tabId }: { state: string; onStateChange: (s: string) => void; tabId?: string }) => {
    taskbarStateValue = state;
    taskbarStateMock(state, onStateChange, tabId);
    return null;
  },
}));

// 自制标题栏：mock 空壳（listen/getCurrentWindow 依赖 Tauri，jsdom 无环境；组件行为单独测试覆盖）
vi.mock("@/components/layout/CustomTitleBar", () => ({
  CustomTitleBar: ({ tabBar }: { tabBar?: React.ReactNode }) => (
    <div data-testid="custom-titlebar">
      titlebar
      <div data-testid="tabbar-slot">{tabBar}</div>
    </div>
  ),
}));

// 标签栏：mock 空壳（TabBar 行为单独测试覆盖；避免拖入 TabManager 依赖）
vi.mock("@/components/layout/TabBar", () => ({
  TabBar: () => <div data-testid="tabbar">tabbar</div>,
}));

// 模拟 TabManager：单标签 + 空操作，供 AppShell 使用（避免真实 Provider 依赖）
const tabManagerMock = {
  tabs: [
    { id: "t1", pageId: "video-convert", titleKey: "nav.videoConvert" },
    { id: "t2", pageId: "audio-convert", titleKey: "nav.audioConvert" },
  ] as { id: string; pageId: string; titleKey: string }[],
  activeId: "t1",
  openTab: vi.fn(),
  closeTab: vi.fn(),
  duplicateTab: vi.fn(),
  activate: vi.fn(),
  setTabPage: vi.fn(),
  registerSnapshot: vi.fn(() => () => {}),
};
vi.mock("@/tabs/TabManager", () => ({
  useTabManager: () => tabManagerMock,
  TabIdProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// 模拟 useTasks：空任务映射 + 空操作
const tasksMock = {
  taskTabMap: new Map() as Map<string, string>,
  stopTabTasks: vi.fn(),
};
vi.mock("@/tasks/TaskProvider", () => ({
  useTasks: () => tasksMock,
}));

// 模拟 SettingsProvider：默认 settings=null、update 记调用
const updateMock = vi.fn();
let settingsMock: Record<string, unknown> | null = null;
vi.mock("@/settings/SettingsProvider", () => ({
  useSettings: () => ({
    settings: settingsMock,
    update: updateMock,
    persist: vi.fn(),
    loading: false,
  }),
}));

// 每个测试后卸载组件，防止残留组件监听 window keydown / 泄漏的定时器污染下一测试
afterEach(() => {
  cleanup();
});

const renderShell = (page: string, onNavigate: (p: string) => void) =>
  render(
    <AppShell page={page as never} onNavigate={onNavigate as never} renderPage={() => <div>content</div>} />,
  );

describe("AppShell 侧边栏", () => {
  beforeEach(() => {
    updateMock.mockClear();
    settingsMock = null;
  });

  it("渲染全部 8 个导航项", () => {
    const { container } = render(
      <AppShell page="video-convert" onNavigate={() => {}} renderPage={() => <div>content</div>} />
    );
    // 8 个导航项 + 1 折叠按钮
    expect(container.querySelectorAll("nav button").length).toBe(9);
    // 8 个导航 id 都在 NAV_ITEMS
    const ids = NAV_ITEMS.map((n) => n.id);
    expect(ids).toHaveLength(8);
  });

  it("存在选中指示条元素", () => {
    const { container } = render(
      <AppShell page="video-convert" onNavigate={() => {}} renderPage={() => <div>content</div>} />
    );
    const indicator = container.querySelector('nav div[aria-hidden="true"]');
    expect(indicator).not.toBeNull();
  });

  it("图标 hover 动画由 GSAP 驱动（无 CSS 缩放类，transform 交给 GSAP inline）", () => {
    const { container } = render(
      <AppShell page="video-convert" onNavigate={() => {}} renderPage={() => <div>content</div>} />
    );
    const icon = container.querySelector("nav button svg");
    expect(icon).not.toBeNull();
    // 不再叠加 CSS hover 缩放类（GSAP 接管 transform）
    expect(icon!.getAttribute("class")).not.toContain("group-hover:scale");
    expect(icon!.getAttribute("class")).not.toContain("group-hover:opacity-80");
    // 透明度过渡保留（选中态控制），transform 由 GSAP 管理
    expect(icon!.getAttribute("class")).toContain("transition-opacity");
  });

  it("切换菜单后指示条位置随激活项更新（GSAP 驱动）", () => {
    // jsdom 不自动执行 rAF，mock 为立即执行以模拟浏览器
    const rafOrig = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    };
    try {
      const { container } = render(
        <AppShell page="video-convert" onNavigate={() => {}} renderPage={() => <div>content</div>} />
      );
      const buttons = Array.from(container.querySelectorAll("nav button"));
      act(() => {
        fireEvent.click(buttons[2]);
      });
      const indicator = container.querySelector('nav div[aria-hidden="true"]');
      // GSAP 用 inline transform 驱动指示条（不再依赖 CSS transition）
      const style = indicator!.getAttribute("style") || "";
      expect(style).toContain("transform:");
    } finally {
      globalThis.requestAnimationFrame = rafOrig;
    }
  });

  it("初始化加载时指示条不依赖 CSS transition（GSAP 接管）", () => {
    const { container } = render(
      <AppShell page="settings" onNavigate={() => {}} renderPage={() => <div>content</div>} />
    );
    const indicator = container.querySelector('nav div[aria-hidden="true"]');
    const style = indicator!.getAttribute("style") || "";
    // 指示条样式不再包含 CSS transition 声明
    expect(style).not.toContain("transition:");
  });

  it("折叠后仍保留 8 个导航项", () => {
    const { container } = render(
      <AppShell page="video-convert" onNavigate={() => {}} renderPage={() => <div>content</div>} />
    );
    const collapseBtn = Array.from(container.querySelectorAll("nav button")).find(
      (b) => b.textContent === "←",
    );
    act(() => {
      fireEvent.click(collapseBtn!);
    });
    expect(container.querySelectorAll("nav button").length).toBe(9);
  });

  it("图标颜色跟随强调色：全部导航图标带 text-primary，激活项不透明、未激活半透", () => {
    const { container } = render(
      <AppShell page="video-convert" onNavigate={() => {}} renderPage={() => <div>content</div>} />
    );
    const navButtons = Array.from(container.querySelectorAll("nav button")).filter(
      (b) => b.querySelector("svg"),
    );
    expect(navButtons.length).toBe(8);

    navButtons.forEach((btn) => {
      const icon = btn.querySelector("svg")!;
      const cls = icon.getAttribute("class") ?? "";
      // 全部图标都使用强调色 text-primary
      expect(cls).toContain("text-primary");
    });

    // 激活项（第一个 = video-convert）：opacity-100
    const activeIcon = navButtons[0].querySelector("svg")!;
    expect(activeIcon.getAttribute("class")).toContain("opacity-100");
    // 未激活项（其余 6 个）：opacity-50
    navButtons.slice(1).forEach((btn) => {
      const cls = btn.querySelector("svg")!.getAttribute("class") ?? "";
      expect(cls).toContain("opacity-50");
    });
  });

  it("导航文字颜色不受图标着色影响（激活 text-foreground / 未激活 text-muted-foreground）", () => {
    const { container } = render(
      <AppShell page="video-convert" onNavigate={() => {}} renderPage={() => <div>content</div>} />
    );
    const navButtons = Array.from(container.querySelectorAll("nav button")).filter(
      (b) => b.querySelector("svg"),
    );
    // 激活按钮
    expect(navButtons[0].getAttribute("class")).toContain("text-foreground");
    // 未激活按钮
    navButtons.slice(1).forEach((btn) => {
      expect(btn.getAttribute("class")).toContain("text-muted-foreground");
    });
    // 文字 span 无 text-primary（颜色类只加在图标上）
    const span = navButtons[0].querySelector("span");
    expect(span).not.toBeNull();
    expect(span!.getAttribute("class") ?? "").not.toContain("text-primary");
  });
});

describe("AppShell 侧边栏快捷键", () => {
  beforeEach(() => {
    updateMock.mockClear();
    taskbarStateMock.mockClear();
    taskbarStateValue = null;
    settingsMock = null;
  });

  const press = (key: string) => {
    fireEvent.keyDown(window, { key });
  };

  // 单按 Tab 经 320ms 定时器生效，双击 Tab 立即生效
  it("单按 Tab：展开↔收起日志面板（重启记忆三态 state 传入 TaskBottomBar）", () => {
    vi.useFakeTimers();
    try {
      let st: Record<string, unknown> = { logPanelState: "collapsed" };
      settingsMock = st;
      const shell = () => (
        <AppShell page="video-convert" onNavigate={() => {}} renderPage={() => <div>content</div>} />
      );
      const { rerender } = render(shell());
      expect(taskbarStateValue).toBe("collapsed");

      // 单按 Tab → 展开
      press("Tab");
      vi.advanceTimersByTime(350);
      expect(updateMock).toHaveBeenCalledWith({ logPanelState: "expanded" });

      // 模拟应用内 update 生效后重渲染 → state 跟随
      st = { logPanelState: "expanded" };
      settingsMock = st;
      rerender(shell());
      expect(taskbarStateValue).toBe("expanded");

      // 再单按 Tab → 收起
      press("Tab");
      vi.advanceTimersByTime(350);
      expect(updateMock).toHaveBeenLastCalledWith({ logPanelState: "collapsed" });
      st = { logPanelState: "collapsed" };
      settingsMock = st;
      rerender(shell());
      expect(taskbarStateValue).toBe("collapsed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("双击 Tab（300ms 内两次）：完全隐藏；再次双击恢复显示之前状态", () => {
    vi.useFakeTimers();
    try {
      let st: Record<string, unknown> = { logPanelState: "collapsed" };
      settingsMock = st;
      const shell = () => (
        <AppShell page="video-convert" onNavigate={() => {}} renderPage={() => <div>content</div>} />
      );
      const { rerender } = render(shell());

      // 连续两次 Tab（同帧内）→ 隐藏
      press("Tab");
      press("Tab");
      expect(updateMock).toHaveBeenCalledWith({ logPanelState: "hidden" });
      // 隐藏后无残留单按定时器
      vi.advanceTimersByTime(400);
      expect(updateMock).toHaveBeenCalledTimes(1);

      st = { logPanelState: "hidden" };
      settingsMock = st;
      rerender(shell());
      expect(taskbarStateValue).toBe("hidden");

      // 再次双击 Tab → 恢复显示为之前状态（collapsed）
      press("Tab");
      press("Tab");
      expect(updateMock).toHaveBeenLastCalledWith({ logPanelState: "collapsed" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("隐藏状态下单按 Tab：恢复显示为收起", () => {
    vi.useFakeTimers();
    try {
      settingsMock = { logPanelState: "hidden" };
      const shell = () => (
        <AppShell page="video-convert" onNavigate={() => {}} renderPage={() => <div>content</div>} />
      );
      render(shell());
      press("Tab");
      vi.advanceTimersByTime(350);
      expect(updateMock).toHaveBeenCalledWith({ logPanelState: "collapsed" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("输入框聚焦时 Tab 不触发日志快捷键（保留原生焦点跳转）", () => {
    const { container } = renderShell("video-convert", () => {});
    const input = document.createElement("input");
    container.appendChild(input);
    input.focus();
    // fire 到 input 元素本身：e.target = input → isEditableTarget 命中 → 快捷键屏蔽
    fireEvent.keyDown(input, { key: "Tab" });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("日志三态经持久化配置加载：settings.logPanelState 驱动 TaskBottomBar", () => {
    settingsMock = { logPanelState: "hidden" };
    renderShell("video-convert", () => {});
    expect(taskbarStateValue).toBe("hidden");
  });

  it("W/S/↑/↓ 循环切换导航选中（边界回绕不报错）", () => {
    // 模拟真实应用：onNavigate 更新 page 并重渲染（快捷键依赖当前页索引）
    let page: string = "video-convert";
    const shell = (current: string) => (
      <AppShell
        page={current as never}
        onNavigate={(p) => {
          page = p;
        }}
        renderPage={() => <div>content</div>}
      />
    );
    const { rerender } = render(shell(page));
    const rerenderTo = () => rerender(shell(page));

    // S / ↓ 下移 → audio-convert
    press("s");
    expect(page).toBe("audio-convert");
    rerenderTo();
    press("ArrowDown");
    expect(page).toBe("image-convert");
    rerenderTo();

    // W / ↑ 上移 → audio-convert
    press("w");
    expect(page).toBe("audio-convert");
    rerenderTo();
    press("ArrowUp");
    expect(page).toBe("video-convert");
    rerenderTo();

    // 边界回绕：当前 video-convert（首项），按上 → 切到最后一项 settings
    press("w");
    expect(page).toBe("settings");
    rerenderTo();
    // 再按下 → 回到首项 video-convert
    press("s");
    expect(page).toBe("video-convert");
  });

  it("A/← 收起侧边栏、D/→ 展开侧边栏", () => {
    renderShell("video-convert", () => {});
    press("a");
    expect(updateMock).toHaveBeenLastCalledWith({ sidebarCollapsed: true });
    press("ArrowLeft");
    expect(updateMock).toHaveBeenLastCalledWith({ sidebarCollapsed: true });
    press("d");
    expect(updateMock).toHaveBeenLastCalledWith({ sidebarCollapsed: false });
    press("ArrowRight");
    expect(updateMock).toHaveBeenLastCalledWith({ sidebarCollapsed: false });
  });

  it("输入框聚焦时屏蔽全部快捷键", () => {
    const nav = vi.fn();
    const { container } = renderShell("video-convert", nav);
    const input = document.createElement("input");
    container.appendChild(input);
    input.focus();

    // 焦点在 input：W/S/A/D 与方向键均不触发
    fireEvent.keyDown(input, { key: "w" });
    fireEvent.keyDown(input, { key: "s" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "a" });
    fireEvent.keyDown(input, { key: "d" });
    expect(nav).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("收起状态持久化：settings.sidebarCollapsed 控制折叠宽度", () => {
    settingsMock = { sidebarCollapsed: true };
    const { container } = renderShell("video-convert", () => {});
    const navEl = container.querySelector("nav")!;
    // 收起宽度 w-12
    expect(navEl.getAttribute("class")).toContain("w-12");
  });

  it("开启自定义背景：根容器注入 bg-glass-enabled（面板半透明条件类）", () => {
    settingsMock = { backgroundEnabled: true };
    const { container } = renderShell("video-convert", () => {});
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("bg-glass-enabled");
  });

  it("开启自定义背景：透明度参数转 CSS 变量注入（板块/侧边栏日志独立）", () => {
    settingsMock = {
      backgroundEnabled: true,
      panelOpacity: 62,
      chromeOpacity: 40,
    };
    const { container } = renderShell("video-convert", () => {});
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue("--panel-alpha")).toBe("0.62");
    expect(root.style.getPropertyValue("--chrome-alpha")).toBe("0.4");
    // 侧边栏挂 data-slot="sidebar"（CSS 选择器命中锚点）
    const nav = container.querySelector("nav")!;
    expect(nav.getAttribute("data-slot")).toBe("sidebar");
  });

  it("关闭自定义背景：不注入 CSS 透明度变量（面板不透明）", () => {
    settingsMock = { backgroundEnabled: false, panelOpacity: 30, chromeOpacity: 30 };
    const { container } = renderShell("video-convert", () => {});
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue("--panel-alpha")).toBe("");
    expect(root.style.getPropertyValue("--chrome-alpha")).toBe("");
  });

  it("关闭自定义背景：根容器不注入 bg-glass-enabled（面板不透明）", () => {
      settingsMock = { backgroundEnabled: false };
      const { container } = renderShell("video-convert", () => {});
      const root = container.firstElementChild as HTMLElement;
      expect(root.className).not.toContain("bg-glass-enabled");
    });

    it("根容器注入 data-panel-effect：默认 blur", () => {
      settingsMock = { backgroundEnabled: false };
      const { container } = renderShell("video-convert", () => {});
      const root = container.firstElementChild as HTMLElement;
      expect(root.getAttribute("data-panel-effect")).toBe("blur");
    });

    it("根容器注入 data-panel-effect：跟随配置 transparent", () => {
      settingsMock = { backgroundEnabled: true, panelEffect: "transparent" };
      const { container } = renderShell("video-convert", () => {});
      const root = container.firstElementChild as HTMLElement;
      expect(root.getAttribute("data-panel-effect")).toBe("transparent");
    });

  it("鼠标点击菜单功能不受快捷键影响", () => {
    const nav = vi.fn();
    const { container } = renderShell("video-convert", nav);
    const buttons = Array.from(container.querySelectorAll("nav button"));
    act(() => {
      fireEvent.click(buttons[1]); // audio-convert
    });
    expect(nav).toHaveBeenCalledWith("audio-convert");
  });
});

describe("AppShell 标签切换快捷键（Q/E）", () => {
  beforeEach(() => {
    updateMock.mockClear();
    tabManagerMock.activate.mockClear();
    settingsMock = null;
  });

  it("E 向右切换到下一个标签；Q 向左切换上一个标签", () => {
    tabManagerMock.activeId = "t1";
    renderShell("video-convert", () => {});
    // E → 下一个（t2）
    fireEvent.keyDown(window, { key: "e" });
    expect(tabManagerMock.activate).toHaveBeenCalledWith("t2");
    tabManagerMock.activate.mockClear();

    // Q → 上一个（从 t1 回绕到 t2；n=2，idx=0 → (0-1+2)%2=1）
    fireEvent.keyDown(window, { key: "q" });
    expect(tabManagerMock.activate).toHaveBeenCalledWith("t2");
  });

  it("输入框聚焦时 Q/E 不触发标签切换", () => {
    tabManagerMock.activeId = "t1";
    const { container } = renderShell("video-convert", () => {});
    const input = document.createElement("input");
    container.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "e" });
    fireEvent.keyDown(input, { key: "q" });
    expect(tabManagerMock.activate).not.toHaveBeenCalled();
  });
});

describe("AppShell 全局 ESC 快捷键", () => {
  beforeEach(() => {
    updateMock.mockClear();
    settingsMock = null;
    resetDialogStack();
  });

  it("/about 页无弹窗按 ESC：返回设置页（onNavigate('settings')）", () => {
    const nav = vi.fn();
    renderShell("about", nav);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(nav).toHaveBeenCalledWith("settings");
  });

  it("非 about 页（video-convert）无弹窗按 ESC：完全无响应", () => {
    const nav = vi.fn();
    renderShell("video-convert", nav);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(nav).not.toHaveBeenCalled();
  });

  it("有弹窗打开按 ESC：关闭弹窗，且不触发 /about 返回（弹窗优先）", () => {
    const nav = vi.fn();
    renderShell("about", nav);
    const closeFn = vi.fn();
    registerDialogClose(closeFn);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(closeFn).toHaveBeenCalledTimes(1);
    expect(nav).not.toHaveBeenCalled(); // 弹窗优先，未返回设置
  });

  it("弹窗打开但输入框聚焦按 ESC：仍关闭弹窗（模态弹窗 ESC 优先于防误触）", () => {
    const nav = vi.fn();
    const { container } = renderShell("about", nav);
    const closeFn = vi.fn();
    registerDialogClose(closeFn);
    const input = document.createElement("input");
    container.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "Escape" });
    // 弹窗关闭优先：输入框聚焦不影响弹窗 ESC 关闭（否则快速任务弹窗永远关不掉）
    expect(closeFn).toHaveBeenCalledTimes(1);
    expect(nav).not.toHaveBeenCalled();
  });

  it("/about 页输入框聚焦按 ESC：不返回设置（防误触）", () => {
    const nav = vi.fn();
    const { container } = renderShell("about", nav);
    const input = document.createElement("input");
    container.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(nav).not.toHaveBeenCalled();
  });

  it("ESC 不会触发任何关闭主窗口逻辑（无 window.close 调用）", () => {
    const spy = vi.spyOn(window, "close").mockImplementation(() => {});
    const nav = vi.fn();
    renderShell("video-convert", nav);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
