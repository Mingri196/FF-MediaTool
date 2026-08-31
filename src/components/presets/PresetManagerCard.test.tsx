// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { PresetManagerCard } from "@/components/presets/PresetManagerCard";
import { zh } from "@/i18n/locales/zh";

let currentPresets: typeof mockPresets;
let updateCalls: Record<string, unknown>[] = [];

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

vi.mock("@/settings/SettingsProvider", () => ({
  useSettings: () => ({
    settings: { presets: currentPresets, recentPresets: ["p-audio", "p-clip"] },
    update: (patch: Record<string, unknown>) => {
      updateCalls.push(patch);
      // 模拟状态更新：presets 被清空
      if ("presets" in patch) {
        currentPresets = patch.presets as typeof mockPresets;
      }
    },
  }),
}));

beforeEach(() => {
  currentPresets = [...mockPresets];
  updateCalls = [];
});

describe("设置页预设管理：4 类预设 + 清除所有", () => {
  it("列表展示 4 类预设的 Badge（视频/音频/图片/剪辑）", () => {
    const { container } = render(<PresetManagerCard />);
    const text = container.textContent ?? "";
    expect(text).toContain("视频预设");
    expect(text).toContain("音频预设");
    expect(text).toContain("图片预设");
    expect(text).toContain("剪辑预设");
    // 4 个类型 badge
    expect(text).toContain("视频");
    expect(text).toContain("音频");
    expect(text).toContain("图片");
    expect(text).toContain("剪辑");
  });

  it("右上角显示【清除所有预设】按钮，无【新建预设】按钮", () => {
    const { container } = render(<PresetManagerCard />);
    const buttons = Array.from(container.querySelectorAll("button")).map(
      (b) => b.textContent ?? "",
    );
    expect(buttons.some((t) => t.includes("清除所有预设"))).toBe(true);
    expect(buttons.some((t) => t.includes("新建预设"))).toBe(false);
  });

  it("点击清除所有预设 → 弹出确认弹窗（含取消/确认清除）", () => {
    const { container } = render(<PresetManagerCard />);
    const btn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("清除所有预设"),
    );
    expect(btn).not.toBeNull();
    act(() => {
      fireEvent.click(btn!);
    });
    // 弹窗出现，含确认文案
    const dialog = document.querySelector('[role="alertdialog"], [role="dialog"]');
    expect(dialog).not.toBeNull();
    const text = dialog?.textContent ?? "";
    expect(text).toContain("确定要清除全部编码预设吗？此操作不可恢复。");
    expect(text).toContain("取消");
    expect(text).toContain("确认清除");
  });

  it("点击取消 → 预保留不动，无 update 调用", () => {
    const { container } = render(<PresetManagerCard />);
    const btn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("清除所有预设"),
    );
    act(() => {
      fireEvent.click(btn!);
    });
    // 点取消
    const cancelBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("取消"),
    );
    act(() => {
      fireEvent.click(cancelBtn!);
    });
    // 没有清除调用
    expect(updateCalls.length).toBe(0);
    // 列表仍显示 4 个预设
    const text = container.textContent ?? "";
    expect(text).toContain("视频预设");
    expect(text).toContain("剪辑预设");
  });

  it("点击确认清除 → update 清空 presets（含 recentPresets）", () => {
    const { container } = render(<PresetManagerCard />);
    const btn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("清除所有预设"),
    );
    act(() => {
      fireEvent.click(btn!);
    });
    // 点确认清除
    const confirmBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("确认清除"),
    );
    act(() => {
      fireEvent.click(confirmBtn!);
    });
    // update 被调用：presets 空数组 + recentPresets 空数组
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0]).toEqual({ presets: [], recentPresets: [] });
  });

  it("预设为空时显示空状态提示（含保存为预设引导）", () => {
    currentPresets = [];
    const { container } = render(<PresetManagerCard />);
    const text = container.textContent ?? "";
    expect(text).toContain("暂无预设");
    expect(text).toContain("保存为预设");
    // 清除按钮在无预设时应禁用
    const btn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("清除所有预设"),
    );
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});