// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { TabManagerProvider, useTabManager, useTabId, useTabInitialState, TabIdProvider, MAX_TABS, type TabDef } from "./TabManager";
import { zh } from "@/i18n/locales/zh";

vi.mock("@/i18n", () => ({
  useI18n: () => ({ t: (k: string) => (zh as Record<string, string>)[k] ?? k }),
}));

/** 探针：每次渲染都把最新 manager 值写入全局，供断言取最新 */
let probe: ReturnType<typeof useTabManager> | null = null;
function Probe() {
  probe = useTabManager();
  return null;
}

function renderManager() {
  render(
    <TabManagerProvider>
      <Probe />
    </TabManagerProvider>,
  );
  expect(probe).not.toBeNull();
  return probe!;
}

/** 执行动作并重新获取最新 manager（context 值随 re-render 更新） */
const getM = () => probe!;

describe("TabManager 核心逻辑", () => {
  it("启动默认 1 个标签，打开设置页", () => {
    renderManager();
    const m = getM();
    expect(m.tabs).toHaveLength(1);
    expect(m.tabs[0].pageId).toBe("settings");
    expect(m.activeId).toBe(m.tabs[0].id);
  });

  it("点 + 新建标签：默认打开设置页，并激活新标签", () => {
    renderManager();
    act(() => { getM().openTab("settings"); });
    const m = getM();
    expect(m.tabs).toHaveLength(2);
    expect(m.tabs[1].pageId).toBe("settings");
    expect(m.activeId).toBe(m.tabs[1].id);
  });

  it("openTab 可指定页面（视频转换）", () => {
    renderManager();
    act(() => { getM().openTab("video-convert"); });
    const m = getM();
    const tab = m.tabs.find((t) => t.id !== m.tabs[0].id)!;
    expect(tab.pageId).toBe("video-convert");
    expect(tab.titleKey).toBe("nav.videoConvert");
  });

  it("setTabPage：修改指定标签的页面，不新建标签", () => {
    renderManager();
    let id = "";
    act(() => { id = getM().openTab("video-convert"); });
    const count = getM().tabs.length;
    act(() => { getM().setTabPage(id, "audio-convert"); });
    expect(getM().tabs).toHaveLength(count); // 不新增
    expect(getM().tabs.find((t) => t.id === id)!.pageId).toBe("audio-convert");
  });

  it("关闭标签：非激活标签被关闭后，激活标签不变", () => {
    renderManager();
    const first = getM().activeId;
    let second = "";
    act(() => { second = getM().openTab("settings"); });
    expect(getM().activeId).toBe(second);
    act(() => { void getM().closeTab(first); });
    expect(getM().tabs).toHaveLength(1);
    expect(getM().activeId).toBe(second);
  });

  it("关闭激活标签：自动激活相邻标签", () => {
    renderManager();
    const first = getM().activeId;
    act(() => { getM().openTab("video-convert"); });
    const second = getM().activeId;
    act(() => { void getM().closeTab(second); });
    expect(getM().tabs).toHaveLength(1);
    expect(getM().activeId).toBe(first);
  });

  it("复制标签：新标签放到末尾，状态快照注入（含表单参数）", () => {
    renderManager();
    const srcId = getM().tabs[0].id;
    act(() => {
      getM().registerSnapshot(srcId, "settings", () => ({ input: "D:/a.mp4", format: "mp4" }));
    });
    act(() => { getM().duplicateTab(srcId); });
    const m = getM();
    expect(m.tabs).toHaveLength(2);
    const dup = m.tabs[1];
    expect(dup.pageId).toBe("settings");
    expect(dup.initialState).toEqual({ input: "D:/a.mp4", format: "mp4" });
    expect(m.activeId).toBe(dup.id); // 新标签激活
  });

  it("上限：最多 10 个标签", () => {
    renderManager();
    for (let i = 0; i < MAX_TABS + 5; i++) {
      act(() => { getM().openTab("settings"); });
    }
    expect(getM().tabs.length).toBe(MAX_TABS);
  });
});

describe("TabManager 标签上下文", () => {
  it("TabIdProvider 提供标签 id 与初始快照", () => {
    let capturedId = "";
    let capturedInit: unknown = "none";
    function Inner() {
      capturedId = useTabId();
      capturedInit = useTabInitialState();
      return null;
    }
    const tab: TabDef = { id: "tab-x", pageId: "settings", titleKey: "nav.settings", initialState: { a: 1 } };
    render(
      <TabManagerProvider>
        <TabIdProvider tab={tab}>
          <Inner />
        </TabIdProvider>
      </TabManagerProvider>,
    );
    expect(capturedId).toBe("tab-x");
    expect(capturedInit).toEqual({ a: 1 });
  });

  it("无 TabIdProvider 时 useTabId 返回空串", () => {
    let capturedId = "x";
    function Inner() { capturedId = useTabId(); return null; }
    render(
      <TabManagerProvider>
        <Inner />
      </TabManagerProvider>,
    );
    expect(capturedId).toBe("");
  });
});
