// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { AboutPage, GITHUB_URL, MIT_LICENSE_URL } from "./AboutPage";

const openUrlMock = vi.fn();

vi.mock("@/i18n", () => ({
  useI18n: () => ({ t: (k: string) => k }),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: async (url: string) => openUrlMock(url),
}));

// 运行时版本号由 Tauri API 提供（构建时 tauri.conf.json 从 package.json 读取）
vi.mock("@tauri-apps/api/app", () => ({
  getVersion: async () => "0.88.0",
}));

afterEach(() => cleanup());
beforeEach(() => openUrlMock.mockClear());

const renderAbout = (onBack = vi.fn()) => render(<AboutPage onBack={onBack} />);

describe("AboutPage 关于详细页", () => {
  it("展示软件大标题、动态版本号、技术栈说明", async () => {
    const { getByText, findByText } = renderAbout();
    expect(getByText("FF-MediaTool")).not.toBeNull();
    // 版本号运行时从 Tauri API 读取（getVersion mock 返回 0.88.0），展示带 Beta 后缀
    expect(await findByText("v0.88.0 Beta")).not.toBeNull();
    expect(getByText("about.stackLine")).not.toBeNull();
    expect(getByText("about.versionLine")).not.toBeNull();
  });

  it("GitHub 链接存在且可点击（调用系统浏览器）", () => {
    const { getByTestId } = renderAbout();
    const link = getByTestId("about-repo-link");
    expect(link.textContent).toBe(GITHUB_URL);
    fireEvent.click(link);
    expect(openUrlMock).toHaveBeenCalledWith(GITHUB_URL);
  });

  it("展示 MIT 许可证说明与「查看完整 MIT 协议」按钮；点击打开 MIT 外部链接（不弹内部弹窗）", () => {
    const { getByText } = renderAbout();
    expect(getByText("MIT License")).not.toBeNull();
    expect(getByText("about.mitDesc")).not.toBeNull();
    expect(getByText("about.mitFull")).not.toBeNull();
    // 点击「查看完整 MIT 协议」→ 调用系统浏览器打开 MIT 专属外部链接
    fireEvent.click(getByText("about.mitFull"));
    expect(openUrlMock).toHaveBeenCalledWith(MIT_LICENSE_URL);
    // 不再打开仓库主页
    expect(openUrlMock).not.toHaveBeenCalledWith(GITHUB_URL);
    // 不在软件内部弹出协议弹窗（无 Dialog 渲染）
    expect(document.querySelector("[data-slot=dialog-content]")).toBeNull();
  });

  it("展示功能简述", () => {
    const { getByText } = renderAbout();
    expect(getByText("about.features")).not.toBeNull();
    expect(getByText("about.featuresDesc")).not.toBeNull();
  });

  it("返回按钮触发 onBack", () => {
    const onBack = vi.fn();
    const { getByText } = renderAbout(onBack);
    fireEvent.click(getByText("about.back"));
    expect(onBack).toHaveBeenCalled();
  });

  it("版本号运行时读取并带 Beta 后缀（v0.88.0 Beta，不再硬编码）", async () => {
    const { findByText } = renderAbout();
    // package.json 是唯一版本来源 → tauri.conf.json → getVersion() → 页面展示
    expect(await findByText("v0.88.0 Beta")).not.toBeNull();
  });
});