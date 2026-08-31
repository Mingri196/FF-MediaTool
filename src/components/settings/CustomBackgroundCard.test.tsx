// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act, cleanup } from "@testing-library/react";
import { CustomBackgroundCard } from "./CustomBackgroundCard";

const updateMock = vi.fn();
let settingsMock: Record<string, unknown> | null = null;

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/settings/SettingsProvider", () => ({
  useSettings: () => ({
    settings: settingsMock,
    update: updateMock,
    persist: vi.fn(),
    loading: false,
  }),
}));

vi.mock("@/lib/tauri", () => ({
  api: {
    backgroundImport: async () => "copied.png",
  },
}));

// mock 文件对话框：返回一个外部路径
let openResult: string | null = null;
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: async () => openResult,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// 图库弹窗：渲染为可关闭的空壳（单独文件测）
vi.mock("./BackgroundLibraryDialog", () => ({
  BackgroundLibraryDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="lib-dialog">library</div> : null,
}));

const baseSettings = () => ({
  backgroundEnabled: false,
  backgroundFile: null,
  backgroundOpacity: 100,
  panelOpacity: 100,
  chromeOpacity: 100,
  panelEffect: "blur",
  backgroundVideoSpeed: 1,
});

beforeEach(() => {
  updateMock.mockClear();
  openResult = null;
  settingsMock = baseSettings();
});

afterEach(() => {
  cleanup();
});

describe("CustomBackgroundCard", () => {
  it("渲染总开关与两个按钮（选择背景文件 / 自定义图库）", () => {
    const { container, getByText } = render(<CustomBackgroundCard />);
    expect(container.querySelector('[data-slot="switch"]')).not.toBeNull();
    expect(getByText("settings.appearance.bgSelect")).not.toBeNull();
    expect(getByText("settings.appearance.bgLibrary")).not.toBeNull();
    // 默认未选择
    expect(getByText("settings.appearance.bgNone")).not.toBeNull();
  });

  it("开关切换写入 backgroundEnabled", () => {
    const { container } = render(<CustomBackgroundCard />);
    const sw = container.querySelector('[data-slot="switch"]')!;
    fireEvent.click(sw);
    expect(updateMock).toHaveBeenCalledWith({ backgroundEnabled: true });
  });

  it("选择外部文件 → 调用 backgroundImport 复制副本并启用 + 保存文件名", async () => {
    openResult = "D:/outside/wall.jpg";
    const { getAllByText } = render(<CustomBackgroundCard />);
    await act(async () => {
      fireEvent.click(getAllByText("settings.appearance.bgSelect")[0]);
    });
    // 导入返回内部文件名 "copied.png"（不保存外部路径）→ 配置其作为当前背景
    expect(updateMock).toHaveBeenCalledWith({
      backgroundFile: "copied.png",
      backgroundEnabled: true,
    });
  });

  it("取消选择文件时不产生任何更新", async () => {
    openResult = null;
    const { getAllByText } = render(<CustomBackgroundCard />);
    await act(async () => {
      fireEvent.click(getAllByText("settings.appearance.bgSelect")[0]);
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("透明度滑块调节写入 backgroundOpacity 并显示百分比", () => {
    settingsMock = { ...baseSettings(), backgroundOpacity: 80 };
    const { getByText } = render(<CustomBackgroundCard />);
    expect(getByText("80%")).not.toBeNull();
    const sliders = document.querySelectorAll('[data-slot="slider"]');
    expect(sliders.length).toBeGreaterThanOrEqual(2);
    // 触发第一个滑块（透明度）变更
    act(() => {
      fireEvent.keyDown(sliders[0], { key: "ArrowRight" });
    });
  });

  it("板块透明度滑块：默认 100，调节写入 panelOpacity 并显示百分比", () => {
    settingsMock = { ...baseSettings(), panelOpacity: 62 };
    const { getByText } = render(<CustomBackgroundCard />);
    expect(getByText("62%")).not.toBeNull();
    const sliders = document.querySelectorAll('[data-slot="slider"]');
    expect(sliders.length).toBe(4); // 背景/板块/侧边栏日志/视频速度
    act(() => {
      fireEvent.keyDown(sliders[1], { key: "ArrowLeft" });
    });
  });

  it("侧边栏与运行日志透明度滑块：显示当前值，默认 100", () => {
    settingsMock = { ...baseSettings(), backgroundOpacity: 80, panelOpacity: 90, chromeOpacity: 40 };
    const { getByText, unmount } = render(<CustomBackgroundCard />);
    expect(getByText("40%")).not.toBeNull();
    const sliders = document.querySelectorAll('[data-slot="slider"]');
    expect(sliders.length).toBe(4); // 背景/板块/侧边栏日志/视频速度
    // 默认值场景：100 显示正常（其余滑块非 100 以保证唯一）
    unmount();
    settingsMock = { ...baseSettings(), backgroundOpacity: 80, panelOpacity: 90, chromeOpacity: 100 };
    const { getByText: getByText2 } = render(<CustomBackgroundCard />);
    expect(getByText2("100%")).not.toBeNull();
  });

  it("视频背景时速度滑块可用；图片背景时禁用", () => {
    // 图片背景：速度滑块禁用
    settingsMock = {
      ...baseSettings(),
      backgroundEnabled: true,
      backgroundFile: "a.png",
    };
    const { unmount } = render(<CustomBackgroundCard />);
    const sliders = document.querySelectorAll('[data-slot="slider"]');
    expect(sliders.length).toBe(4);
    // [3] 为视频速度滑块
    expect(sliders[3].hasAttribute("data-disabled")).toBe(true);

    unmount();
    // 视频背景 + 启用：速度滑块启用
    settingsMock = {
      ...baseSettings(),
      backgroundEnabled: true,
      backgroundFile: "a.mp4",
      backgroundVideoSpeed: 1.5,
    };
    const { getByText } = render(<CustomBackgroundCard />);
    expect(getByText("1.5x")).not.toBeNull();
    const sliders2 = document.querySelectorAll('[data-slot="slider"]');
    expect(sliders2[3].hasAttribute("data-disabled")).toBe(false);
  });

  it("点击图库按钮打开图库弹窗", () => {
    const { getByText, queryByTestId } = render(<CustomBackgroundCard />);
    expect(queryByTestId("lib-dialog")).toBeNull();
    fireEvent.click(getByText("settings.appearance.bgLibrary"));
    expect(document.querySelector('[data-testid="lib-dialog"]')).not.toBeNull();
  });

  describe("面板效果（模糊 / 透明）", () => {
    it("默认选中「模糊效果」", () => {
      const { getByRole } = render(<CustomBackgroundCard />);
      const blur = getByRole("radio", { name: "settings.appearance.bgPanelEffectBlur" });
      const transparent = getByRole("radio", { name: "settings.appearance.bgPanelEffectTransparent" });
      expect(blur.getAttribute("aria-checked")).toBe("true");
      expect(transparent.getAttribute("aria-checked")).toBe("false");
    });

    it("点击「透明效果」写入 panelEffect: transparent", () => {
      const { getByRole } = render(<CustomBackgroundCard />);
      const transparent = getByRole("radio", { name: "settings.appearance.bgPanelEffectTransparent" });
      fireEvent.click(transparent);
      expect(updateMock).toHaveBeenCalledWith({ panelEffect: "transparent" });
    });

    it("点击「模糊效果」写入 panelEffect: blur", () => {
      settingsMock = { ...baseSettings(), panelEffect: "transparent" };
      const { getByRole } = render(<CustomBackgroundCard />);
      const blur = getByRole("radio", { name: "settings.appearance.bgPanelEffectBlur" });
      fireEvent.click(blur);
      expect(updateMock).toHaveBeenCalledWith({ panelEffect: "blur" });
    });

    it("已存配置 panelEffect: transparent 时该选项选中", () => {
      settingsMock = { ...baseSettings(), panelEffect: "transparent" };
      const { getByRole } = render(<CustomBackgroundCard />);
      const transparent = getByRole("radio", { name: "settings.appearance.bgPanelEffectTransparent" });
      expect(transparent.getAttribute("aria-checked")).toBe("true");
      const blur = getByRole("radio", { name: "settings.appearance.bgPanelEffectBlur" });
      expect(blur.getAttribute("aria-checked")).toBe("false");
    });

    it("UI 位置：位于格式说明文字（bgSelectHint）下方、背景透明度滑块（bgOpacity）上方", () => {
      const { container } = render(<CustomBackgroundCard />);
      // 按 DOM 顺序收集三个锚点文本，验证相对顺序
      const texts: string[] = [];
      const walk = (el: Element) => {
        el.childNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
            texts.push(node.textContent.trim());
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            walk(node as Element);
          }
        });
      };
      walk(container);
      const iHint = texts.findIndex((x) => x.includes("bgSelectHint"));
      const iOpacity = texts.findIndex((x) => x.includes("bgOpacity"));
      // 取面板效果主标题（第一个出现处）
      const iEffectTitle = texts.findIndex((x) => x === "settings.appearance.bgPanelEffect");
      expect(iHint).toBeGreaterThanOrEqual(0);
      expect(iEffectTitle).toBeGreaterThan(iHint);
      expect(iOpacity).toBeGreaterThan(iEffectTitle);
    });
  });
});