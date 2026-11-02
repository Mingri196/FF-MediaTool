// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ToolsPage } from "./ToolsPage";

vi.mock("@/i18n", () => ({
  useI18n: () => ({ t: (k: string) => k }),
}));

const guardAddTask = vi.fn();
vi.mock("@/tasks/TaskProvider", () => ({
  useTasks: () => ({ guardAddTask }),
}));

vi.mock("@/tabs/TabManager", () => ({
  useTabId: () => "tab-1",
  useTabInitialState: () => undefined,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(async () => "D:\\in\\cat.mp4"),
}));

vi.mock("@/lib/tauri", () => ({
  api: {
    mediaProbeBasic: vi.fn(async () => ({
      ok: true, durationMs: 60_000, hasVideo: true, hasAudio: true, streams: [], error: null,
    })),
    getOptDir: vi.fn(async () => "C:\\opt"),
    ensureDir: vi.fn(async () => undefined),
  },
}));

afterEach(() => {
  cleanup();
  guardAddTask.mockClear();
});

async function openTargetCompress() {
  render(<ToolsPage />);
  fireEvent.click(screen.getByTestId("tool-card-target-compress"));
  // 点击选文件按钮 → dialog mock 返回 cat.mp4 → 探测时长 60s
  fireEvent.click(screen.getByTestId("tc-pick"));
  await waitFor(() => expect(screen.getByTestId("tc-bitrate").textContent).not.toBe("—"));
}

describe("ToolsPage 独立工具", () => {
  it("工具列表渲染「目标压缩」卡片", () => {
    render(<ToolsPage />);
    expect(screen.getByTestId("tool-card-target-compress")).toBeTruthy();
    expect(screen.getByText("tools.targetCompress.name")).toBeTruthy();
  });

  it("点击卡片进入目标压缩详情（参数区 + 命令预览）", async () => {
    await openTargetCompress();
    expect(screen.getByTestId("tool-target-compress")).toBeTruthy();
    expect(screen.getByTestId("tc-pick")).toBeTruthy();
    expect(screen.getByTestId("tc-target")).toBeTruthy();
    // 音频下拉触发器显示翻译后的标签（不是原始值 keep）
    expect(screen.getByTestId("tc-audio").textContent).toContain("tools.audio.keep");
    // 命令预览已自动生成（包含两遍命令）
    const textarea = await waitFor(() => {
      const el = screen.getByRole("textbox") as HTMLTextAreaElement;
      expect(el.value).toContain("-pass 1");
      return el;
    });
    expect(textarea.value).toContain("-pass 2");
  });

  it("详情页返回按钮回到工具列表", () => {
    render(<ToolsPage />);
    fireEvent.click(screen.getByTestId("tool-card-target-compress"));
    fireEvent.click(screen.getByText("tools.back"));
    expect(screen.queryByTestId("tool-target-compress")).toBeNull();
    expect(screen.getByTestId("tool-card-target-compress")).toBeTruthy();
  });

  it("加入任务队列：先建输出子目录，再按顺序添加两个任务（pass1 不检查输出冲突）", async () => {
    const { api } = await import("@/lib/tauri");
    await openTargetCompress();
    fireEvent.click(screen.getByText("tools.addTask"));
    await waitFor(() => expect(guardAddTask).toHaveBeenCalledTimes(2));
    // 输出子目录：opt/<文件名（不含扩展名）>/
    expect(api.ensureDir).toHaveBeenCalledWith("C:\\opt\\cat");
    const [pass1, pass2] = guardAddTask.mock.calls.map((c) => c[0]);
    expect(pass1.args[pass1.args.indexOf("-pass") + 1]).toBe("1");
    expect(pass1.outputPath).toBe("");
    expect(pass2.args[pass2.args.indexOf("-pass") + 1]).toBe("2");
    expect(pass2.outputPath).toBe("C:\\opt\\cat\\cat.mp4");
  });
});
