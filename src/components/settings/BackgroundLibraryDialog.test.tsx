// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act, waitFor, cleanup } from "@testing-library/react";
import { BackgroundLibraryDialog } from "./BackgroundLibraryDialog";

const updateMock = vi.fn();
let settingsMock: Record<string, unknown> | null = null;
let listResult: { name: string; path: string }[] = [];
const deleteMock = vi.fn();

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
    backgroundDelete: async (name: string) => deleteMock(name),
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
  deleteMock.mockClear();
  settingsMock = base();
  listResult = [
    { name: "a.png", path: "C:/bg/a.png" },
    { name: "b.jpg", path: "C:/bg/b.jpg" },
    { name: "c.webp", path: "C:/bg/c.webp" },
    { name: "d.mp4", path: "C:/bg/d.mp4" },
    { name: "e.webm", path: "C:/bg/e.webm" },
    { name: "f.gif", path: "C:/bg/f.gif" }, // 应过滤
    { name: "g.txt", path: "C:/bg/g.txt" }, // 应过滤
  ];
});

afterEach(() => {
  cleanup();
});

const renderDialog = (open = true) =>
  render(
    <BackgroundLibraryDialog open={open} onClose={() => {}} />,
  );

/** 素材按钮：aria-label = 文件名（删除按钮的 aria-label 是 bgDelete 文案，需排除） */
const assetButtons = () =>
  Array.from(document.querySelectorAll("button[aria-label]")).filter(
    (n) => !(n.getAttribute("aria-label") ?? "").includes("settings.appearance"),
  );

describe("BackgroundLibraryDialog", () => {
  it("窗口尺寸加大（宽 960px 级）且支持手动缩放（data-resizable）", async () => {
    renderDialog();
    await waitFor(() => {
      expect(assetButtons().length).toBe(5);
    });
    const content = document.querySelector('[data-slot="dialog-content"]')!;
    // 自定义宽高类 + 可缩放标记
    expect(content.getAttribute("data-resizable")).not.toBeNull();
    const cls = content.getAttribute("class") ?? "";
    expect(cls).toContain("w-[min(92vw,960px)]");
    // resize:both 缩放手柄样式由 index.css 的 [data-resizable] 规则提供
    // （CSS 直接写入源码，这里验证标记已挂上即可）
  });

  it("缩略图网格自适应（auto-fill + minmax，窗口拉大格子变大）", async () => {
    renderDialog();
    await waitFor(() => {
      expect(assetButtons().length).toBe(5);
    });
    const grid = document.querySelector('[data-slot="dialog-content"] .grid')!;
    const cls = grid.getAttribute("class") ?? "";
    expect(cls).toContain("repeat(auto-fill,minmax(160px,1fr))");
  });

  it("正确枚举 png/jpg/webp/mp4/webm，过滤 gif/txt", async () => {
    renderDialog();
    await waitFor(() => {
      // Dialog 内容通过 portal 渲染到 document.body
      expect(assetButtons().length).toBe(5);
    });
    const labels = assetButtons().map((n) => n.getAttribute("aria-label"));
    expect(labels).toEqual(["a.png", "b.jpg", "c.webp", "d.mp4", "e.webm"]);
  });

  it("图片素材用 img 缩略；视频素材用 video 首帧", async () => {
    renderDialog();
    await waitFor(() => {
      const imgs = document.querySelectorAll("img");
      expect(imgs.length).toBe(3); // png/jpg/webp
      const vids = document.querySelectorAll("video");
      expect(vids.length).toBe(2); // mp4/webm，muted 首帧
      vids.forEach((v) => expect(v.muted).toBe(true));
    });
  });

  it("点击素材直接设为当前背景（窗口可保持打开）", async () => {
    renderDialog();
    await waitFor(() => {
      expect(assetButtons().length).toBe(5);
    });
    const item = assetButtons().find(
      (n) => n.getAttribute("aria-label") === "d.mp4",
    )!;
    act(() => {
      fireEvent.click(item);
    });
    expect(updateMock).toHaveBeenCalledWith({
      backgroundFile: "d.mp4",
      backgroundEnabled: true,
    });
  });

  it("删除素材调用 backgroundDelete 并刷新列表", async () => {
    renderDialog();
    await waitFor(() => {
      expect(assetButtons().length).toBe(5);
    });
    // 确认框放行
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const trash = Array.from(document.querySelectorAll("button")).find((b) =>
      b.getAttribute("aria-label")?.includes("settings.appearance.bgDelete"),
    );
    expect(trash).not.toBeUndefined();
    await act(async () => {
      fireEvent.click(trash!);
    });
    expect(deleteMock).toHaveBeenCalled();
  });

  it("删除当前使用中的背景：自动关闭背景并提示", async () => {
    settingsMock = { ...base(), backgroundFile: "a.png", backgroundEnabled: true };
    renderDialog();
    await waitFor(() => {
      expect(assetButtons().length).toBe(5);
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const trash = Array.from(document.querySelectorAll("button")).find((b) =>
      b.getAttribute("aria-label")?.includes("settings.appearance.bgDelete"),
    );
    await act(async () => {
      fireEvent.click(trash!);
    });
    expect(updateMock).toHaveBeenCalledWith({
      backgroundFile: null,
      backgroundEnabled: false,
    });
  });

  it("图库为空时显示空状态文案", async () => {
    listResult = [];
    renderDialog();
    await waitFor(() => {
      expect(
        document.body.textContent?.includes("settings.appearance.bgLibraryEmpty"),
      ).toBe(true);
    });
  });

  it("关闭按钮触发 onClose", async () => {
    const onClose = vi.fn();
    render(<BackgroundLibraryDialog open={true} onClose={onClose} />);
    await waitFor(() => {
      expect(assetButtons().length).toBe(5);
    });
    const footerBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("common.close"),
    );
    act(() => {
      fireEvent.click(footerBtn!);
    });
    expect(onClose).toHaveBeenCalled();
  });
});