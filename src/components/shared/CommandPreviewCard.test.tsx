// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { CommandPreviewCard } from "@/components/shared/CommandPreviewCard";
import { useCommandPreview, tokenizeArgs, normalizeUserArgs } from "@/components/shared/useCommandPreview";
import { zh } from "@/i18n/locales/zh";
import { en } from "@/i18n/locales/en";

afterEach(cleanup);

// 顶层 mock：dict 可全局切换（zh/en）
vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => (globalThis as unknown as { __DICT?: Record<string, string> }).__DICT?.[key] ?? key,
    lang: (globalThis as unknown as { __DICT?: Record<string, string> }).__DICT === en ? "en" : "zh",
  }),
}));

const useZh = () => { (globalThis as unknown as { __DICT?: Record<string, string> }).__DICT = zh; };
const useEn = () => { (globalThis as unknown as { __DICT?: Record<string, string> }).__DICT = en; };
beforeEach(() => { (globalThis as unknown as { __DICT?: Record<string, string> }).__DICT = zh; });

const base = {
  value: "-i in.mp4 -c:v libx264 out.mp4",
  onEdit: () => {},
  startLabelKey: "video.start",
  onStart: vi.fn(),
  onCopy: vi.fn(),
  overwriteOpen: false,
  overwriteText: "",
  onConfirmOverwrite: vi.fn(),
  onCancelOverwrite: vi.fn(),
};

describe("CommandPreviewCard 组件", () => {
  it("中文环境：标题=命令预览、复制=复制命令、textarea 可编辑、开始处理按钮存在、占位提示", () => {
    useZh();
    const { container, getByText, getByPlaceholderText } = render(
      <CommandPreviewCard {...base} />,
    );
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(ta).toBeTruthy();
    expect(ta.value).toBe("-i in.mp4 -c:v libx264 out.mp4");
    expect(getByPlaceholderText("选择输入文件与输出格式后自动生成命令行")).toBeTruthy();
    expect(getByText("命令预览")).toBeTruthy();
    expect(getByText("复制命令")).toBeTruthy();
    expect(getByText("开始处理")).toBeTruthy();
  });

  it("英文环境：标题 Command preview、复制 Copy command、开始 Start", () => {
    useEn();
    const { getByText } = render(<CommandPreviewCard {...base} />);
    expect(getByText("Command preview")).toBeTruthy();
    expect(getByText("Copy command")).toBeTruthy();
    expect(getByText("Start")).toBeTruthy();
  });

  it("空命令时开始/复制按钮禁用，不触发回调", () => {
    useZh();
    const onStart = vi.fn();
    const onCopy = vi.fn();
    const { getByText } = render(
      <CommandPreviewCard {...base} onStart={onStart} onCopy={onCopy} value="" empty />,
    );
    const startBtn = getByText("开始处理").closest("button")!;
    const copyBtn = getByText("复制命令").closest("button")!;
    expect(startBtn.disabled).toBe(true);
    expect(copyBtn.disabled).toBe(true);
    fireEvent.click(startBtn);
    fireEvent.click(copyBtn);
    expect(onStart).not.toHaveBeenCalled();
    expect(onCopy).not.toHaveBeenCalled();
  });

  it("覆盖确认弹窗：文案 + 确认/取消回调", () => {
    useZh();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { getByText } = render(
      <CommandPreviewCard
        {...base}
        overwriteOpen
        overwriteText="-i new.mp4 out.mp4"
        onConfirmOverwrite={onConfirm}
        onCancelOverwrite={onCancel}
      />,
    );
    expect(getByText("覆盖自定义命令")).toBeTruthy();
    expect(getByText("界面参数变更将会覆盖你手动修改的自定义命令，是否确认覆盖？")).toBeTruthy();
    expect(getByText("确认覆盖")).toBeTruthy();
    expect(getByText("取消")).toBeTruthy();
    fireEvent.click(getByText("确认覆盖").closest("button")!);
    fireEvent.click(getByText("取消").closest("button")!);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("useCommandPreview hook", () => {
  function Harness({ autoArgs }: { autoArgs: string[] | null }) {
    const p = useCommandPreview(autoArgs);
    return (
      <div>
        <span data-testid="text">{p.text}</span>
        <span data-testid="dirty">{String(p.dirty)}</span>
        <span data-testid="open">{String(p.overwriteOpen)}</span>
        <span data-testid="pending">{p.pendingText}</span>
        <button data-testid="edit" onClick={() => p.setText("CUSTOM CMD")}>edit</button>
        <button data-testid="confirm" onClick={p.confirmOverwrite}>confirm</button>
        <button data-testid="cancel" onClick={p.cancelOverwrite}>cancel</button>
        <button data-testid="args" onClick={() => (window as unknown as { __a?: string[] }).__a = p.getArgs()}>args</button>
      </div>
    );
  }

  it("autoArgs 自动生成文本；getArgs 返回 autoArgs；未编辑时更新直接刷新", () => {
    const { rerender, getByTestId } = render(<Harness autoArgs={["-i", "a.mp4", "-c:v", "libx264"]} />);
    expect(getByTestId("text").textContent).toBe("-i a.mp4 -c:v libx264");
    fireEvent.click(getByTestId("args"));
    expect((window as unknown as { __a?: string[] }).__a).toEqual(["-i", "a.mp4", "-c:v", "libx264"]);
    rerender(<Harness autoArgs={["-i", "b.mp4", "-c:v", "libx265"]} />);
    expect(getByTestId("text").textContent).toBe("-i b.mp4 -c:v libx265");
    expect(getByTestId("dirty").textContent).toBe("false");
  });

  it("编辑后 dirty=true；getArgs 优先返回编辑命令", () => {
    const { getByTestId } = render(<Harness autoArgs={["-i", "a.mp4", "-c:v", "libx264"]} />);
    fireEvent.click(getByTestId("edit"));
    expect(getByTestId("dirty").textContent).toBe("true");
    fireEvent.click(getByTestId("args"));
    expect((window as unknown as { __a?: string[] }).__a).toEqual(["CUSTOM", "CMD"]);
  });

  it("编辑后 autoArgs 变化 → 弹确认；确认 → 新命令覆盖并清 dirty", () => {
    const { rerender, getByTestId } = render(<Harness autoArgs={["-i", "a.mp4"]} />);
    fireEvent.click(getByTestId("edit"));
    rerender(<Harness autoArgs={["-i", "b.mp4", "-c:v", "libx265"]} />);
    expect(getByTestId("open").textContent).toBe("true");
    expect(getByTestId("pending").textContent).toBe("-i b.mp4 -c:v libx265");
    fireEvent.click(getByTestId("confirm"));
    expect(getByTestId("open").textContent).toBe("false");
    expect(getByTestId("dirty").textContent).toBe("false");
    expect(getByTestId("text").textContent).toBe("-i b.mp4 -c:v libx265");
  });

  it("编辑后 autoArgs 变化 → 取消保留用户内容，dirty 仍为 true", () => {
    const { rerender, getByTestId } = render(<Harness autoArgs={["-i", "a.mp4"]} />);
    fireEvent.click(getByTestId("edit"));
    rerender(<Harness autoArgs={["-i", "b.mp4"]} />);
    fireEvent.click(getByTestId("cancel"));
    expect(getByTestId("open").textContent).toBe("false");
    expect(getByTestId("text").textContent).toBe("CUSTOM CMD");
    expect(getByTestId("dirty").textContent).toBe("true");
  });

  it("autoArgs 为空（未选文件）→ 不弹窗", () => {
    const { getByTestId } = render(<Harness autoArgs={null} />);
    expect(getByTestId("text").textContent).toBe("");
    expect(getByTestId("open").textContent).toBe("false");
  });
});

describe("tokenizeArgs / normalizeUserArgs", () => {
  it("处理引号与转义空格", () => {
    expect(tokenizeArgs('-i "C:/My Video/a.mp4" -c:v libx264 "out file.mp4"')).toEqual([
      "-i", "C:/My Video/a.mp4", "-c:v", "libx264", "out file.mp4",
    ]);
    expect(tokenizeArgs("a\\ b c")).toEqual(["a b", "c"]);
  });
  it("normalizeUserArgs 去掉 ffmpeg 前缀", () => {
    expect(normalizeUserArgs("ffmpeg -y -i in.mp4 out.mp4")).toEqual(["-y", "-i", "in.mp4", "out.mp4"]);
  });
  it("Windows 路径的单反斜杠不被吞（转义仅对引号/反斜杠/空白生效）", () => {
    expect(tokenizeArgs("-i D:\\a\\b.mp4")).toEqual(["-i", "D:\\a\\b.mp4"]);
    expect(tokenizeArgs('-passlogfile "D:\\out\\v.mp4.passlog"')).toEqual([
      "-passlogfile", "D:\\out\\v.mp4.passlog",
    ]);
    // 双反斜杠仍折叠为单个（显式转义）
    expect(tokenizeArgs("D:\\\\a.mp4")).toEqual(["D:\\a.mp4"]);
  });
});
