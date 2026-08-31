import { useEffect, useState } from "react";
import type { PageId } from "@/types";

/** 顶级路由页面集合（与侧边栏导航 + about 平级） */
export const ROUTE_PAGES: PageId[] = [
  "video-convert",
  "audio-convert",
  "image-convert",
  "video-clip",
  "media-info",
  "batch",
  "settings",
  "about",
];

const DEFAULT_PAGE: PageId = "settings";

/**
 * 轻量 hash 路由：
 * - URL 形如 `#/about`、`#/settings`、`#/video-convert`（顶级路由，非子组件）
 * - 未知 hash 回退默认页；页面对象与 location.hash 双向同步
 */
export function pageToHash(page: PageId): string {
  return `#/${page}`;
}

export function hashToPage(hash: string): PageId {
  const id = hash.replace(/^#\/?/, "").split("?")[0].split("#")[0] as PageId;
  return ROUTE_PAGES.includes(id) ? id : DEFAULT_PAGE;
}

/** 导航到指定页面（写入 URL hash，触发路由变化） */
export function navigate(page: PageId) {
  const target = pageToHash(page);
  if (window.location.hash === target) return;
  window.location.hash = target;
}

/** 读取当前 URL 对应的页面 */
export function currentPageFromUrl(): PageId {
  return hashToPage(window.location.hash);
}

/** React hook：监听 hashchange，返回当前路由页面 */
export function usePageRoute(): PageId {
  const [page, setPage] = useState<PageId>(currentPageFromUrl);
  useEffect(() => {
    const onHash = () => setPage(currentPageFromUrl());
    window.addEventListener("hashchange", onHash);
    // 首次挂载时若 hash 为空，规整为默认页的 hash（可选）
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return page;
}
