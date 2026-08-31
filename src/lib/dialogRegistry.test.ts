import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  registerDialogClose,
  hasOpenDialog,
  closeTopDialog,
  resetDialogStack,
} from "./dialogRegistry";

beforeEach(() => {
  resetDialogStack();
});

describe("dialogRegistry 弹窗注册栈", () => {
  it("注册后 hasOpenDialog 为 true；注销后为 false", () => {
    expect(hasOpenDialog()).toBe(false);
    const unregister = registerDialogClose(() => {});
    expect(hasOpenDialog()).toBe(true);
    unregister();
    expect(hasOpenDialog()).toBe(false);
  });

  it("closeTopDialog 调用最顶层注册的关闭回调并出栈（后进先出）", () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    registerDialogClose(closeA);
    registerDialogClose(closeB);
    expect(closeTopDialog()).toBe(true);
    expect(closeB).toHaveBeenCalledTimes(1);
    expect(closeA).not.toHaveBeenCalled();
    // 再关一次 → 关闭 A
    expect(closeTopDialog()).toBe(true);
    expect(closeA).toHaveBeenCalledTimes(1);
    // 栈空
    expect(closeTopDialog()).toBe(false);
    expect(hasOpenDialog()).toBe(false);
  });

  it("中间注销不影响其他注册项", () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    registerDialogClose(closeA);
    const unB = registerDialogClose(closeB);
    unB(); // B 注销
    expect(closeTopDialog()).toBe(true);
    expect(closeA).toHaveBeenCalledTimes(1);
    expect(closeB).not.toHaveBeenCalled();
  });
});
