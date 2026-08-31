// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { VideoClipPage } from "@/pages/VideoClipPage";
import { zh } from "@/i18n/locales/zh";

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

describe("预设模块隔离：剪辑页只列出 clip 类预设", () => {
  it("剪辑页预设下拉显示（默认参数）+ 剪辑预设，不含其它类别", () => {
    const { container } = render(<VideoClipPage />);
    
    // 顶部预设下拉 = 第一个 select-trigger
    const triggers = Array.from(
      container.querySelectorAll('[data-slot="select-trigger"]'),
    );
    expect(triggers.length).toBeGreaterThan(0);
    act(() => {
      fireEvent.click(triggers[0] as HTMLElement);
    });

    const popup = document.querySelector('[data-slot="select-content"]') as HTMLElement;
    expect(popup).not.toBeNull();
    const text = popup?.textContent ?? "";
    expect(text).toContain("（默认参数）");
    expect(text).toContain("剪辑预设");
    expect(text).not.toContain("视频预设");
    expect(text).not.toContain("音频预设");
    expect(text).not.toContain("图片预设");
  });
});