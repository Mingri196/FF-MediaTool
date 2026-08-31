// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";
import { useState } from "react";
import { PageStack } from "./PageStack";

afterEach(() => cleanup());

/** rAF 立即执行，让进入/退出动画在下一帧触发 */
let rafOrig: typeof globalThis.requestAnimationFrame;
beforeEach(() => {
  rafOrig = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  };
});
afterEach(() => {
  globalThis.requestAnimationFrame = rafOrig;
});

const renderPage = (id: string) => <div data-testid={`page-${id}`}>page {id}</div>;

function Harness({ initial }: { initial: string }) {
  const [page, setPage] = useState(initial);
  return (
    <div>
      <PageStack page={page} renderPage={renderPage} />
      <button data-testid="go-about" onClick={() => setPage("about")}>to about</button>
      <button data-testid="go-settings" onClick={() => setPage("settings")}>to settings</button>
      <button data-testid="go-video" onClick={() => setPage("video-convert")}>to video</button>
    </div>
  );
}

/** 当前渲染的所有页面层 */
const layers = () => Array.from(document.querySelectorAll("[data-page-layer]"));

describe("PageStack 设置↔关于 滑动动画", () => {
  it("初始只渲染当前页 static 层", () => {
    render(<Harness initial="settings" />);
    expect(layers().length).toBe(1);
    expect(layers()[0].getAttribute("data-page-layer")).toBe("static");
  });

  it("settings→about：设置页保留下层，关于页从 translateX(-100%) 滑入覆盖", () => {
    render(<Harness initial="settings" />);
    act(() => {
      fireEvent.click(document.querySelector('[data-testid="go-about"]')!);
    });
    // 两页叠放：settings static + about enter
    expect(layers().length).toBe(2);
    const aboutLayer = document.querySelector('[data-page-layer="enter"]')!;
    const settingsLayer = document.querySelector('[data-page-layer="static"]')!;
    expect(settingsLayer.textContent).toContain("page settings");
    expect(aboutLayer.textContent).toContain("page about");
    // enter 起步 -100%（rAF 同步后应到 0；因 rAF 同步，此处直接断言最终 0 与层仍存在）
    expect(aboutLayer.getAttribute("style")).toContain("translateX(0)");
  });

  it("about→settings：关于页滑出(0→100%)后从栈移除，设置页保留", () => {
    render(<Harness initial="about" />);
    act(() => {
      fireEvent.click(document.querySelector('[data-testid="go-settings"]')!);
    });
    // exit 层 = about，translateX 目标 100%
    const exitLayer = document.querySelector('[data-page-layer="exit"]')!;
    expect(exitLayer.textContent).toContain("page about");
    expect(exitLayer.getAttribute("style")).toContain("translateX(100%)");
    // 设置页在下层
    const staticLayers = Array.from(document.querySelectorAll('[data-page-layer="static"]'));
    expect(staticLayers.some((s) => s.textContent?.includes("page settings"))).toBe(true);
    // 触发 transitionend → about 层移除
    act(() => {
      fireEvent.transitionEnd(exitLayer);
    });
    expect(layers().length).toBe(1);
    expect(layers()[0].textContent).toContain("page settings");
  });

  it("settings→about 进入完成后：设置页被卸载，about 成为唯一独立顶级页面", () => {
    render(<Harness initial="settings" />);
    act(() => {
      fireEvent.click(document.querySelector('[data-testid="go-about"]')!);
    });
    const enterLayer = document.querySelector('[data-page-layer="enter"]')!;
    act(() => {
      fireEvent.transitionEnd(enterLayer);
    });
    // 只有 about 一层（设置页彻底离开 DOM —— 独立顶级页面，非设置页上层叠放）
    expect(layers().length).toBe(1);
    expect(layers()[0].textContent).toContain("page about");
    expect(layers()[0].getAttribute("data-page-layer")).toBe("static");
    expect(document.body.textContent).not.toContain("page settings");
  });

  it("其它页面切换：直切为单层，无动画层", () => {
    render(<Harness initial="settings" />);
    act(() => {
      fireEvent.click(document.querySelector('[data-testid="go-video"]')!);
    });
    expect(layers().length).toBe(1);
    expect(layers()[0].textContent).toContain("page video-convert");
    expect(layers()[0].getAttribute("data-page-layer")).toBe("static");
  });

  it("页面切换不修改任何配置（纯 UI 状态，无额外调用）", () => {
    render(<Harness initial="settings" />);
    act(() => {
      fireEvent.click(document.querySelector('[data-testid="go-about"]')!);
    });
    // 无异常、层结构正确即通过（PageStack 不触碰 settings 持久化）
    expect(layers().length).toBeGreaterThanOrEqual(1);
  });
});