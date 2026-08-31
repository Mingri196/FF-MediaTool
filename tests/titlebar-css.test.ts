// @vitest-environment node
// 该测试在 tests/ 目录，不在 tsconfig include（src）内，可安全使用 node 内置模块
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "../src/index.css"), "utf-8");

describe("index.css 顶部栏透明化规则", () => {
  it("存在 .bg-glass-enabled [data-slot=titlebar] 规则（跟随 chrome 透明度）", () => {
    expect(css).toContain('.bg-glass-enabled [data-slot="titlebar"]');
  });

  it("存在透明面板效果下 titlebar 关闭模糊的规则", () => {
    expect(css).toContain(
      '.bg-glass-enabled[data-panel-effect="transparent"] [data-slot="titlebar"]',
    );
  });

  it("titlebar 与 sidebar/taskbar 同属 chrome 透明度组", () => {
    // chrome 组共享 --chrome-alpha 变量与 blur(12px)
    const chromeBlock =
      '.bg-glass-enabled [data-slot="taskbar"],\n.bg-glass-enabled [data-slot="sidebar"],\n.bg-glass-enabled [data-slot="titlebar"]';
    expect(css).toContain(chromeBlock);
    expect(css).toContain("--chrome-alpha");
  });
});
