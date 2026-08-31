// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { AudioConvertPage } from "@/pages/AudioConvertPage";
import { zh } from "@/i18n/locales/zh";

// 预设样本：4 类各一条
const mockPresets = [
  { id: "p-video", name: "视频预设", category: "video", createdAt: 1, updatedAt: 1, params: {} },
  { id: "p-audio", name: "音频预设", category: "audio", createdAt: 2, updatedAt: 2, params: {} },
  { id: "p-image", name: "图片预设", category: "image", createdAt: 3, updatedAt: 3, params: {} },
  { id: "p-clip", name: "剪辑预设", category: "clip", createdAt: 4, updatedAt: 4, params: {} },
];

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => zh[key as keyof typeof zh] ?? key,
  }),

}));


vi.mock("@/tabs/TabManager", () => ({
  useTabManager: () => ({
    tabs: [], activeId: "", openTab: vi.fn(), closeTab: vi.fn(), duplicateTab: vi.fn(),
    activate: vi.fn(), setTabPage: vi.fn(), registerSnapshot: vi.fn(() => () => {}),
  }),
  useTabId: () => "test-tab",
  useTabInitialState: () => undefined,
  useRegisterPageSnapshot: () => {},
}));

vi.mock("@/settings/SettingsProvider", () => ({
  useSettings: () => ({
    settings: { presets: mockPresets, outputPaths: {}, lastOutputDir: null },
    update: () => {},
  }),
}));

vi.mock("@/tasks/TaskProvider", () => ({
  useTasks: () => ({ guardAddTask: () => {} }),
}));

vi.mock("@/lib/tauri", () => ({
  api: { getOptDir: async () => "opt", mediaProbeBasic: async () => null },
  invoke: async () => [],
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: async () => null,
}));

describe("预设模块隔离：音频页只列出 audio 类预设", () => {
  it("预设下拉选项包含（默认参数）与音频预设，不包含视频/图片/剪辑预设", () => {
    const { container } = render(<AudioConvertPage />);

    // 页面右上角预设下拉：trigger + content
    const presetTrigger = Array.from(
      container.querySelectorAll('[data-slot="select-trigger"]'),
    ).find((el) => el.textContent?.includes("预设") || el.getAttribute("aria-label") !== null);

    // 预设下拉是页面第一个 combobox（顶部）
    const triggers = Array.from(
      container.querySelectorAll('[data-slot="select-trigger"]'),
    );
    expect(triggers.length).toBeGreaterThan(0);
    // 顶部第一个触发按钮应为预设下拉（占位（默认参数））
    const first = triggers[0] as HTMLElement;
    // 打开下拉
        act(() => {
      fireEvent.click(first);
    });

    const popup = document.querySelector('[data-slot="select-content"]') as HTMLElement;
        expect(popup).not.toBeNull();
        const text = popup?.textContent ?? "";
        // 显示（默认参数）+ 音频预设
        expect(text).toContain("（默认参数）");
        expect(text).toContain("音频预设");
        // 不显示其它类别预设
        expect(text).not.toContain("视频预设");
        expect(text).not.toContain("图片预设");
        expect(text).not.toContain("剪辑预设");

        expect(presetTrigger || true).toBe(true);
                // 关闭下拉（Base UI popup 是 body portal，testing-library cleanup 不清理，必须手动关）
                act(() => {
                  fireEvent.keyDown(first, { key: "Escape" });
                });
              });

              it("选中音频预设后，闭合触发按钮显示预设 name 而非 UUID", () => {
        const { container } = render(<AudioConvertPage />);
        const triggers = Array.from(
          container.querySelectorAll('[data-slot="select-trigger"]'),
        );
        const first = triggers[0] as HTMLElement;

        // 打开下拉
        act(() => {
          fireEvent.click(first);
        });
        // 点击"音频预设"选项（id=p-audio）
        // Base UI 需要真实鼠标序列：pointerEnter → pointerDown → click(detail:1) 才会提交选择
        const items = Array.from(document.querySelectorAll('[data-slot="select-item"]'));
        const audioItem = items.find((el) => el.textContent === "音频预设");
        expect(audioItem).not.toBeNull();
        act(() => {
          fireEvent.pointerEnter(audioItem as HTMLElement, { pointerType: "mouse" });
          fireEvent.pointerDown(audioItem as HTMLElement, { pointerType: "mouse" });
          fireEvent.click(audioItem as HTMLElement, { pointerType: "mouse", detail: 1 });
        });

        // 闭合后触发按钮文本 = 预设名称（非 UUID p-audio）
        const triggerText = (triggers[0] as HTMLElement).textContent ?? "";
        expect(triggerText).toContain("音频预设");
        expect(triggerText).not.toContain("p-audio");
        expect(triggerText).not.toContain("p-video");
      });
    });