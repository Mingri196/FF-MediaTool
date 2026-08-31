// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, act, cleanup, waitFor } from "@testing-library/react";
import { hashToPage, navigate, currentPageFromUrl, usePageRoute, ROUTE_PAGES } from "./router";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

function RouterHarness() {
  const page = usePageRoute();
  return <div data-testid="route-page">{page}</div>;
}

describe("顶级 hash 路由", () => {
  it("路由页面集合包含 about 与 settings 等顶级页（平级）", () => {
    expect(ROUTE_PAGES).toContain("about");
    expect(ROUTE_PAGES).toContain("settings");
    expect(ROUTE_PAGES).toContain("video-convert");
    // about 与 settings 同层级（同一集合，无嵌套）
    expect(ROUTE_PAGES.indexOf("about")).toBeGreaterThan(ROUTE_PAGES.indexOf("settings"));
  });

  it("navigate('about') 写入 URL hash #/about；currentPageFromUrl 读回 about", () => {
    navigate("about");
    expect(window.location.hash).toBe("#/about");
    expect(currentPageFromUrl()).toBe("about");
  });

  it("navigate 到任意顶级页（video-convert 等）URL 同步变化", () => {
    navigate("video-convert");
    expect(window.location.hash).toBe("#/video-convert");
    navigate("settings");
    expect(window.location.hash).toBe("#/settings");
  });

  it("hashToPage 未知路径回退默认页 settings；about 识别正确", () => {
    expect(hashToPage("#/about")).toBe("about");
    expect(hashToPage("#/settings")).toBe("settings");
    expect(hashToPage("#/video-convert")).toBe("video-convert");
    expect(hashToPage("#/unknown")).toBe("settings");
    expect(hashToPage("")).toBe("settings");
  });

  it("usePageRoute 随 hashchange 实时返回当前路由页面", async () => {
    const { getByTestId } = render(<RouterHarness />);
    expect(getByTestId("route-page").textContent).toBe("settings");
    act(() => {
      navigate("about");
    });
    await waitFor(() => {
      expect(getByTestId("route-page").textContent).toBe("about");
    });
    act(() => {
      navigate("settings");
    });
    await waitFor(() => {
      expect(getByTestId("route-page").textContent).toBe("settings");
    });
  });
});