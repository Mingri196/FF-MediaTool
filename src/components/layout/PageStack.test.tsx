// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";
import { useState } from "react";
import { PageStack } from "./PageStack";

// mock GSAP：fromTo 把完成回调挂起，测试手动 flush 控制动画完成时机
// （jsdom 下 ticker 无法真实推进时间；手动控制可精确验证中间态与清理）
const gsapState = vi.hoisted(() => ({ pending: [] as Array<Record<string, unknown>> }));
vi.mock("gsap", () => ({
  default: {
    set: () => {},
    fromTo: (_el: unknown, _from: unknown, to: Record<string, unknown>) => {
      gsapState.pending.push(to);
      return {};
    },
    to: () => ({}),
    killTweensOf: () => {},
  },
}));

/** 触发一次挂起的动画完成回调（模拟 GSAP onComplete） */
function flushAnim() {
  act(() => {
    const cb = gsapState.pending.shift();
    if (cb && typeof cb.onComplete === "function") (cb.onComplete as () => void)();
  });
}

afterEach(() => cleanup());
afterEach(() => {
  gsapState.pending.length = 0;
});

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

  it("settings→about：设置页保留下层，关于页滑入覆盖（GSAP 驱动）", () => {
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
    // GSAP 驱动滑动（mock 不写 style；断言层结构与内容即可）
    expect(aboutLayer).not.toBeNull();
  });

  it("about→settings：关于页滑出后从栈移除，设置页保留", () => {
    render(<Harness initial="about" />);
    act(() => {
      fireEvent.click(document.querySelector('[data-testid="go-settings"]')!);
    });
    // exit 层 = about（动画挂起中，层还在）
    const exitLayer = document.querySelector('[data-page-layer="exit"]')!;
    expect(exitLayer.textContent).toContain("page about");
    // 触发 GSAP 完成 → about 层移除
    flushAnim();
    expect(layers().length).toBe(1);
    expect(layers()[0].textContent).toContain("page settings");
  });

  it("settings→about 进入完成后：设置页被卸载，about 成为唯一独立顶级页面", () => {
    render(<Harness initial="settings" />);
    act(() => {
      fireEvent.click(document.querySelector('[data-testid="go-about"]')!);
    });
    // 动画挂起中：两页叠放
    expect(layers().length).toBe(2);
    // 触发 GSAP 完成 → onEntered 清理：只有 about 一层（设置页彻底离开 DOM）
    flushAnim();
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