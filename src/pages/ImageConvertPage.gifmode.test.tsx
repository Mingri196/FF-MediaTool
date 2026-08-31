// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act, cleanup } from "@testing-library/react";
import { ImageConvertPage } from "@/pages/ImageConvertPage";
import { zh } from "@/i18n/locales/zh";

vi.mock("@/i18n", () => ({
  useI18n: () => ({ t: (key: string) => zh[key as keyof typeof zh] ?? key }),

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
    settings: { presets: [], outputPaths: {}, lastOutputDir: null },
    update: () => {},
  }),
}));

const guardMock = vi.fn();
vi.mock("@/tasks/TaskProvider", () => ({
  useTasks: () => ({ guardAddTask: guardMock }),
}));

vi.mock("@/lib/tauri", () => ({
  api: { getOptDir: async () => "opt", mediaProbeBasic: async () => null, writeTextFile: async () => {} },
  invoke: async () => [],
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: async () => null,
}));

// 简化 DropZone：渲染一个触发 onFiles 的按钮，便于注入文件
vi.mock("@/components/shared/DropZone", () => ({
  DropZone: ({ onFiles, children }: { onFiles: (p: string[]) => void; children: React.ReactNode }) => (
    <div>
      <button data-testid="drop-files" onClick={() => onFiles(["D:/a.gif", "D:/b.png"])}>
        add
      </button>
      {children}
    </div>
  ),
}));

/** 切换到 gif 输出格式 */
async function switchToGif(container: HTMLElement) {
  const triggers = Array.from(container.querySelectorAll('[data-slot="select-trigger"]'));
  // triggers[0]=预设下拉，triggers[1]=输出格式下拉
  act(() => {
    fireEvent.click(triggers[1] as HTMLElement);
  });
  const popup = document.querySelector('[data-slot="select-content"]') as HTMLElement;
  const gifItem = Array.from(popup?.querySelectorAll('[data-slot="select-item"]') ?? []).find(
    (el) => (el.textContent ?? "").trim() === "GIF",
  ) as HTMLElement;
  act(() => {
    fireEvent.pointerEnter(gifItem, { pointerType: "mouse" });
    fireEvent.pointerDown(gifItem, { pointerType: "mouse" });
    fireEvent.click(gifItem, { pointerType: "mouse", detail: 1 });
  });
  await Promise.resolve();
}

/** 取拆分/合成模式的 Checkbox input（同一文本会被按钮命中 → 必须定位到 input 元素） */
function modeCheckbox(container: HTMLElement, label: string): HTMLInputElement {
  const el = Array.from(container.querySelectorAll("input")).find(
    (i) => i.id === (label === "拆分模式" ? "gif-split" : "gif-combine"),
  );
  expect(el).toBeTruthy();
  return el as HTMLInputElement;
}

beforeEach(() => {
  guardMock.mockClear();
});
afterEach(() => {
  cleanup();
  // 关闭可能遗留的弹出层
  document.querySelectorAll('[data-slot="select-content"]').forEach((el) => el.remove());
});

describe("图片转换页：GIF 拆分/合成模式（v0.83）", () => {
  it("默认格式非 gif：拆分/合成选项完全隐藏", () => {
    const { container } = render(<ImageConvertPage />);
    expect(container.querySelector("#gif-split")).toBeNull();
    expect(container.querySelector("#gif-combine")).toBeNull();
    expect(container.textContent).toContain("文件列表"); // 无后缀
    expect(container.textContent).not.toContain("拆分模式");
  });

  it("切换为 gif：拆分/合成选项显示，默认都关闭", async () => {
    const { container } = render(<ImageConvertPage />);
    await switchToGif(container);
    const split = modeCheckbox(container, "拆分模式");
    const combine = modeCheckbox(container, "合成模式");
    expect(split).toBeTruthy();
    expect(combine).toBeTruthy();
    expect(split.checked).toBe(false);
    expect(combine.checked).toBe(false);
  });

  it("互斥：勾选拆分 → 合成自动取消；勾选合成 → 拆分自动取消；可全部取消", async () => {
    const { container } = render(<ImageConvertPage />);
    await switchToGif(container);
    const split = modeCheckbox(container, "拆分模式");
    const combine = modeCheckbox(container, "合成模式");

    act(() => fireEvent.click(split));
    expect(split.checked).toBe(true);
    expect(combine.checked).toBe(false);

    act(() => fireEvent.click(combine));
    expect(combine.checked).toBe(true);
    expect(split.checked).toBe(false);

    // 全部取消
    act(() => fireEvent.click(combine));
    expect(combine.checked).toBe(false);
    expect(split.checked).toBe(false);
  });

  it("文件列表标题后缀跟随模式：拆分/合成/普通", async () => {
    const { container } = render(<ImageConvertPage />);
    expect(container.textContent).toContain("文件列表");

    await switchToGif(container);
    const split = modeCheckbox(container, "拆分模式");
    act(() => fireEvent.click(split));
    expect(container.textContent).toContain("文件列表 (拆分模式)");

    const combine = modeCheckbox(container, "合成模式");
    act(() => fireEvent.click(combine));
    expect(container.textContent).toContain("文件列表 (合成模式)");
  });

  it("拆分模式：任务按 GIF 文件生成，输出为 `-01.png` 序列模式", async () => {
    const { container, getByTestId } = render(<ImageConvertPage />);
    act(() => fireEvent.click(getByTestId("drop-files"))); // 注入 a.gif / b.png（全部自动选中）
    await switchToGif(container);
    const split = modeCheckbox(container, "拆分模式");
    act(() => fireEvent.click(split));

    // 点击「开始拆分」按钮（CommandPreviewCard 的按钮文字=startLabelKey=img.gifSplitStart）
    const runBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").trim() === "开始拆分",
    );
    expect(runBtn).toBeTruthy();
    act(() => fireEvent.click(runBtn as HTMLElement));

    const added = guardMock.mock.calls.map((c) => c[0]);
    // 只有 a.gif 生成任务（b.png 静态图被过滤）
    expect(added.length).toBe(1);
    expect(added[0].inputPath).toBe("D:/a.gif");
    expect(added[0].outputPath).toContain("a-%02d.png");
    expect(added[0].args).toContain("-fps_mode");
  });

  it("合成模式：不足 2 张带序号图片时运行按钮禁用", async () => {
    const { container, getByTestId } = render(<ImageConvertPage />);
    act(() => fireEvent.click(getByTestId("drop-files"))); // a.gif / b.png
    await switchToGif(container);
    const combine = modeCheckbox(container, "合成模式");
    act(() => fireEvent.click(combine));

    const runBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").trim() === "开始合成",
    ) as HTMLButtonElement;
    // a.gif 被合成模式过滤（不接受 GIF 输入），b.png 无序号 → combineImages=0 < 2 → 禁用
    expect(runBtn.disabled).toBe(true);
  });
});
