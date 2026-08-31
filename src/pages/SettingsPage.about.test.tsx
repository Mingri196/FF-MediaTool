// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { SettingsPage } from "./SettingsPage";

const updateMock = vi.fn();
let settingsMock: Record<string, unknown> | null = null;

vi.mock("@/i18n", () => ({
  useI18n: () => ({ t: (k: string) => k, setLang: vi.fn() }),
}));

vi.mock("@/settings/SettingsProvider", () => ({
  useSettings: () => ({
    settings: settingsMock,
    update: updateMock,
    persist: vi.fn(),
    loading: false,
  }),
}));

// 子卡片组件全部替换为轻量占位，聚焦「关于本应用」板块自身
vi.mock("@/components/ffmpeg/FfmpegEnvCard", () => ({
  FfmpegEnvCard: () => null,
}));
vi.mock("@/components/presets/PresetManagerCard", () => ({
  PresetManagerCard: () => null,
}));
vi.mock("@/components/settings/CustomBackgroundCard", () => ({
  CustomBackgroundCard: () => null,
}));

afterEach(() => cleanup());

const baseSettings = () => ({
  language: "zh",
  theme: "system",
  accentColor: "#4f46e5",
  ffmpegPath: null,
  ffprobePath: null,
  lastInputDir: null,
  lastOutputDir: null,
  recentPresets: [],
  presets: [],
  hasCompletedFirstRun: true,
  outputPaths: {},
  sidebarCollapsed: false,
  backgroundEnabled: false,
  backgroundFile: null,
  backgroundOpacity: 100,
  panelOpacity: 100,
    chromeOpacity: 100,
    panelEffect: "blur",
    backgroundVideoSpeed: 1,
  logPanelState: "collapsed",
});

describe("SettingsPage 关于本应用板块", () => {
  beforeEach(() => {
    updateMock.mockClear();
    settingsMock = baseSettings();
  });

  it("「关于本应用」板块在编码预设模板之后渲染", () => {
    const { container } = render(<SettingsPage />);
    const aboutCard = Array.from(container.querySelectorAll("[data-slot=card]")).find(
      (c) => c.textContent?.includes("settings.about.title"),
    );
    expect(aboutCard).not.toBeUndefined();
    // 卡片标题
    expect(aboutCard!.textContent).toContain("settings.about.desc");
  });

  it("板块展示动态版本号与技术栈", () => {
    settingsMock = baseSettings();
    const { container } = render(<SettingsPage />);
    const aboutCard = Array.from(container.querySelectorAll("[data-slot=card]")).find(
      (c) => c.textContent?.includes("settings.about.title"),
    )!;
    expect(aboutCard.textContent).toContain("v0.87 Beta");
    expect(aboutCard.textContent).toContain("Tauri 2 + React + Rust");
  });

  it("点击「跳转至详细页」触发 onOpenAbout", () => {
    settingsMock = baseSettings();
    const onOpenAbout = vi.fn();
    const { getByText } = render(<SettingsPage onOpenAbout={onOpenAbout} />);
    fireEvent.click(getByText("settings.about.goto"));
    expect(onOpenAbout).toHaveBeenCalled();
  });

  it("页面底部水印已移除：不再渲染左下角版本号与右下角技术栈", () => {
    settingsMock = baseSettings();
    const { container } = render(<SettingsPage />);
    const body = container.textContent ?? "";
    // 页脚水印是「FF-MediaTool v…Beta」+ Badge，属于页面底部独立行；
    // 删除后 body 不应再包含品牌版本水印（任何版本号都能捕获），关于板块内的 v0.76 不受影响
    expect(body).not.toContain("FF-MediaTool v");
    // 关于板块仍在（仅动态版本 + 技术栈两行 + 按钮，无页脚水印）
    const aboutCard = Array.from(container.querySelectorAll("[data-slot=card]")).find(
      (c) => c.textContent?.includes("settings.about.title"),
          )!;
          expect(aboutCard.textContent).toContain("v0.87 Beta");
        });

        it("重置设置：面板效果恢复默认「模糊效果」", () => {
                const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
                const { getByText } = render(<SettingsPage />);
                // 重置按钮位于「自定义输出路径」折叠面板内，先展开
                fireEvent.click(getByText("settings.outputPath.customToggle"));
                fireEvent.click(getByText("settings.outputPath.resetDefault"));
                // resetDefault 触发 update：透明度恢复 100，面板效果恢复 blur
                const calls = updateMock.mock.calls;
                const lastCall = calls[calls.length - 1][0];
                expect(lastCall).toMatchObject({ panelOpacity: 100, chromeOpacity: 100, panelEffect: "blur" });
                confirmSpy.mockRestore();
              });
      });