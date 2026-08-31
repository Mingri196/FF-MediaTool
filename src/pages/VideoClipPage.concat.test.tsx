// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act, cleanup, waitFor } from "@testing-library/react";
import { VideoClipPage } from "@/pages/VideoClipPage";
import { zh } from "@/i18n/locales/zh";

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, number | string>) => {
      let s = (zh as Record<string, string>)[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));

return s;
    },
  }),
}));

vi.mock("@/settings/SettingsProvider", () => ({
  useSettings: () => ({
    settings: { presets: [], outputPaths: {}, lastOutputDir: null },
    update: () => {},
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

      const guardMock = vi.fn();
vi.mock("@/tasks/TaskProvider", () => ({
  useTasks: () => ({ guardAddTask: guardMock }),
}));

// mediaProbeBasic：依据路径返回不同时长/音频信息
vi.mock("@/lib/tauri", () => ({
  api: {
    getOptDir: async () => "opt",
    mediaProbeBasic: async (p: string) => {
      if (p.includes("bad")) throw new Error("probe fail");
      return {
        durationMs: 10000, // 10s
        hasVideo: true,
        hasAudio: !p.includes("mute"),
        streams: [
          { codecType: "video", width: 1920, height: 1080 },
          ...(p.includes("mute") ? [] : [{ codecType: "audio", width: null, height: null }]),
        ],
        ok: true,
        error: null,
      };
    },
    scanDirectory: async (_p: string, exts?: string[]) => {
      // 模拟后端：按 exts 过滤（视频页传视频后缀 → 只留视频）
      const all = ["D:/v.mp4", "D:/p.png", "D:/a.wav"];
      if (!exts) return all;
      return all.filter((f) => exts.includes(f.split(".").pop() ?? ""));
    },
  },
  invoke: async () => [],
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: async (opts: { multiple?: boolean; directory?: boolean }) => {
    if (opts.directory) return "D:/dir";
    if (opts.multiple) return ["D:/a.mp4", "D:/b.mp4", "D:/mute.mp4", "D:/bad.mkv"];
    return "D:/a.mp4";
  },
}));

// 简化 DropZone：暴露 onFiles
vi.mock("@/components/shared/DropZone", () => ({
  DropZone: ({ onFiles, children }: { onFiles: (p: string[]) => void; children: React.ReactNode }) => (
    <div>
      <button data-testid="drop" onClick={() => onFiles(["D:/a.mp4", "D:/b.mp4"])}>drop</button>
      {children}
    </div>
  ),
}));

beforeEach(() => guardMock.mockClear());
afterEach(() => cleanup());

/** 切换到多片段拼接模式 */
function switchToConcat(container: HTMLElement) {
  const btn = Array.from(container.querySelectorAll("button")).find(
    (b) => (b.textContent ?? "").includes("多片段拼接"),
  );
  act(() => fireEvent.click(btn as HTMLElement));
}

describe("视频剪辑页：多片段拼接模式（v0.85）", () => {
  it("切换模式：concat 显示文件列表，隐藏顶部输入框；trim 恢复时间轴；剪辑模式在输入文件上方", () => {
    const { container } = render(<VideoClipPage />);
    // 默认 trim：有输入文件框；剪辑模式选择位于输入文件上方
    const text = container.textContent ?? "";
    const idxMode = text.indexOf("剪辑模式");
    const idxInput = text.indexOf("输入文件");
    expect(idxMode).toBeGreaterThanOrEqual(0);
    expect(idxInput).toBeGreaterThanOrEqual(0);
    expect(idxMode).toBeLessThan(idxInput); // 模式在上、输入框在下
    switchToConcat(container);
    // concat：文件列表区出现，输入文件框消失
    expect(container.textContent).toContain("视频文件列表");
    expect(container.textContent).not.toContain("输入文件");
    expect(container.textContent).toContain("片段列表");
    // 切回 trim
    const trimBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").includes("时间裁剪"),
    );
    act(() => fireEvent.click(trimBtn as HTMLElement));
    expect(container.textContent).toContain("输入文件");
  });

  it("添加文件：导入视频并显示时长；文件夹导入仅过滤视频", async () => {
    const { container } = render(<VideoClipPage />);
    switchToConcat(container);
    // 添加文件（open 返回 4 个文件）
    const addFilesBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").trim() === "添加文件",
    );
    await act(async () => { fireEvent.click(addFilesBtn as HTMLElement); await Promise.resolve(); });
    await waitFor(() => expect(container.textContent).toContain("已导入 4 个视频文件"));
    // bad.mkv 解析失败标记
    expect(container.textContent).toContain("解析失败");
    // 清空后再测文件夹
    const clearBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").includes("清空列表"),
    );
    act(() => fireEvent.click(clearBtn as HTMLElement));
    await waitFor(() => expect(container.textContent).toContain("暂无视频文件"));
    const addFolderBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").trim() === "添加文件夹",
    );
    await act(async () => { fireEvent.click(addFolderBtn as HTMLElement); await Promise.resolve(); });
    // scanDirectory 返回 3 个，只导入视频（v.mp4）
    await waitFor(() => expect(container.textContent).toContain("已导入 1 个视频文件"));
    expect(container.textContent).toContain("v.mp4");
    expect(container.textContent).not.toContain("p.png");
  });

  it("片段下拉选择文件显示该视频总时长；时间校验置灰运行按钮", async () => {
    const { container } = render(<VideoClipPage />);
    switchToConcat(container);
    const addFilesBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").trim() === "添加文件",
    );
    await act(async () => { fireEvent.click(addFilesBtn as HTMLElement); await Promise.resolve(); });
    await waitFor(() => expect(container.textContent).toContain("已导入 4 个视频文件"));

    // 添加两条片段
        const addSegBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").includes("添加片段"),
    );
    act(() => fireEvent.click(addSegBtn as HTMLElement));
    act(() => fireEvent.click(addSegBtn as HTMLElement));
    await waitFor(() => {
      const segEmpty = container.querySelectorAll("input");
      expect(segEmpty.length).toBeGreaterThanOrEqual(4);
    });

    // 片段行下拉：triggers[0]=顶部预设，triggers[1..]=片段文件下拉（编码区下拉在更下方）
        const triggers = container.querySelectorAll('[data-slot="select-trigger"]');
        act(() => { fireEvent.click(triggers[1] as HTMLElement); });
    const popup = document.querySelector('[data-slot="select-content"]') as HTMLElement;
    const item = Array.from(popup?.querySelectorAll('[data-slot="select-item"]') ?? []).find(
      (el) => ((el.textContent ?? "").includes("a.mp4")),
    ) as HTMLElement;
    act(() => {
      fireEvent.pointerEnter(item, { pointerType: "mouse" });
      fireEvent.pointerDown(item, { pointerType: "mouse" });
      fireEvent.click(item, { pointerType: "mouse", detail: 1 });
    });
    expect(container.textContent).toContain("总时长: 0:10");

    // 时间输入：片段1 起止非法（0→999 超时），片段2 留空 → 运行按钮置灰
    const inputs = container.querySelectorAll("input");
    // 起止时间框（每片段2个，在片段区）
    const timeInputs = Array.from(inputs).filter((i) => i.className.includes("font-mono"));
    act(() => fireEvent.change(timeInputs[0], { target: { value: "0" } }));
    act(() => fireEvent.change(timeInputs[1], { target: { value: "999" } }));
    expect(container.textContent).toContain("超出该视频总时长");

    const startBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").includes("加入任务队列"),
    ) as HTMLButtonElement;
    expect(startBtn.disabled).toBe(true);
    guardMock.mockClear();
    act(() => fireEvent.click(startBtn));
    expect(guardMock).not.toHaveBeenCalled();
  });

  it("全部片段合法 + 2段 → 运行按钮可用并派发任务", async () => {
    const { container } = render(<VideoClipPage />);
    switchToConcat(container);
    const addFilesBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").trim() === "添加文件",
    );
    await act(async () => { fireEvent.click(addFilesBtn as HTMLElement); await Promise.resolve(); });
    await waitFor(() => expect(container.textContent).toContain("已导入 4 个视频文件"));

    const addSegBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").includes("添加片段"),
    );
    act(() => fireEvent.click(addSegBtn as HTMLElement));
    act(() => fireEvent.click(addSegBtn as HTMLElement));

    const triggers = container.querySelectorAll('[data-slot="select-trigger"]');
    // 片段行下拉：triggers[0]=顶部预设，triggers[1..]=片段文件下拉（编码区下拉在更下方）
        // 片段1 选 a.mp4
        act(() => { fireEvent.click(triggers[1] as HTMLElement); });
        let popup = document.querySelector('[data-slot="select-content"]') as HTMLElement;
        let item = Array.from(popup?.querySelectorAll('[data-slot="select-item"]') ?? []).find(
          (el) => ((el.textContent ?? "").includes("a.mp4")),
        ) as HTMLElement;
        act(() => {
          fireEvent.pointerEnter(item, { pointerType: "mouse" });
          fireEvent.pointerDown(item, { pointerType: "mouse" });
          fireEvent.click(item, { pointerType: "mouse", detail: 1 });
        });
        // 片段2 选 mute.mp4
        act(() => { fireEvent.click(triggers[2] as HTMLElement); });
    popup = document.querySelector('[data-slot="select-content"]') as HTMLElement;
    item = Array.from(popup?.querySelectorAll('[data-slot="select-item"]') ?? []).find(
      (el) => ((el.textContent ?? "").includes("mute.mp4")),
    ) as HTMLElement;
    act(() => {
      fireEvent.pointerEnter(item, { pointerType: "mouse" });
      fireEvent.pointerDown(item, { pointerType: "mouse" });
      fireEvent.click(item, { pointerType: "mouse", detail: 1 });
    });

    // 时间：两段都 0→5
    const timeInputs = Array.from(container.querySelectorAll("input")).filter((i) => i.className.includes("font-mono"));
    act(() => fireEvent.change(timeInputs[0], { target: { value: "0" } }));
    act(() => fireEvent.change(timeInputs[1], { target: { value: "5" } }));
    act(() => fireEvent.change(timeInputs[2], { target: { value: "1" } }));
    act(() => fireEvent.change(timeInputs[3], { target: { value: "4" } }));

    const startBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").includes("加入任务队列"),
    ) as HTMLButtonElement;
    expect(startBtn.disabled).toBe(false);
    act(() => fireEvent.click(startBtn));
    expect(guardMock).toHaveBeenCalledTimes(1);
    const task = guardMock.mock.calls[0][0];
    expect(task.args).toContain("-filter_complex");
    expect(task.args.join(" ")).toContain("anullsrc"); // 第二段无音频 → 静音
  });
});