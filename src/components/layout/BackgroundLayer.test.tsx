// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { BackgroundLayer } from "./BackgroundLayer";

const updateMock = vi.fn();
let settingsMock: Record<string, unknown> | null = null;
let listResult: { name: string; path: string }[] = [];

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
    backgroundList: async () => listResult,
  },
}));

// Tauri 环境依赖：convertFileSrc 在纯 jsdom 不可用，mock 为透传
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `asset://${p}`,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const base = () => ({
  backgroundEnabled: false,
  backgroundFile: null,
  backgroundOpacity: 100,
  backgroundVideoSpeed: 1,
});

beforeEach(() => {
  updateMock.mockClear();
  settingsMock = null;
  listResult = [];
});

afterEach(() => {
  cleanup();
});

describe("BackgroundLayer", () => {
  it("未启用时不渲染任何媒体元素", () => {
    settingsMock = base();
    const { container } = render(<BackgroundLayer />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("video")).toBeNull();
  });

  it("启用 + 图片：渲染 img，object-cover 铺满，透明度生效", async () => {
    settingsMock = {
      ...base(),
      backgroundEnabled: true,
      backgroundFile: "wall.png",
      backgroundOpacity: 50,
    };
    listResult = [{ name: "wall.png", path: "C:/app/Background/wall.png" }];
    const { container } = render(<BackgroundLayer />);
    await waitFor(() => {
      const img = container.querySelector("img");
      expect(img).not.toBeNull();
    });
    const img = container.querySelector("img")!;
    expect(img.getAttribute("class")).toContain("object-cover");
    // 透明度 50 → 0.5 应用于背景元素（不影响 UI）
    expect(img.style.opacity).toBe("0.5");
  });

  it("启用 + 视频：渲染静音循环自动播放的 video，且支持播放速度", async () => {
    settingsMock = {
      ...base(),
      backgroundEnabled: true,
      backgroundFile: "bg.mp4",
      backgroundVideoSpeed: 1.5,
    };
    listResult = [{ name: "bg.mp4", path: "C:/app/Background/bg.mp4" }];
    const { container } = render(<BackgroundLayer />);
    await waitFor(() => {
      expect(container.querySelector("video")).not.toBeNull();
    });
    const video = container.querySelector("video")!;
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.autoplay).toBe(true);
    // 播放速度实时写入
    await waitFor(() => {
      expect(video.playbackRate).toBe(1.5);
    });
  });

  it("素材文件丢失：自动关闭背景并触发提示（容错降级）", async () => {
    settingsMock = {
      ...base(),
      backgroundEnabled: true,
      backgroundFile: "gone.png",
    };
    listResult = [{ name: "other.png", path: "C:/app/Background/other.png" }]; // 找不到 gone.png
    render(<BackgroundLayer />);
    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith({
        backgroundEnabled: false,
        backgroundFile: null,
      });
    });
  });

  it("关闭自定义背景：不渲染 video，释放播放资源", async () => {
    settingsMock = {
      ...base(),
      backgroundEnabled: true,
      backgroundFile: "bg.mp4",
    };
    listResult = [{ name: "bg.mp4", path: "C:/app/Background/bg.mp4" }];
    const { container, rerender } = render(<BackgroundLayer />);
    await waitFor(() => {
      expect(container.querySelector("video")).not.toBeNull();
    });
    // 关闭 → 卸载 video
    settingsMock = base();
    rerender(<BackgroundLayer />);
    expect(container.querySelector("video")).toBeNull();
  });

  it("禁用格式（如 .gif）不被解析为媒体", async () => {
    settingsMock = {
      ...base(),
      backgroundEnabled: true,
      backgroundFile: "x.gif",
    };
    listResult = [{ name: "x.gif", path: "C:/app/Background/x.gif" }];
    const { container } = render(<BackgroundLayer />);
    await waitFor(() => {
      // gif 既非图片白名单也非视频白名单 → 不渲染
      expect(container.querySelector("img")).toBeNull();
      expect(container.querySelector("video")).toBeNull();
    });
  });
});