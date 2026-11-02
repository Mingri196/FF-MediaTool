import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PageId } from "@/types";
import type { I18nKey } from "@/i18n";

/** 标签页最大数量 */
export const MAX_TABS = 6;

/** 一个标签实例 */
export interface TabDef {
  id: string;
  /** 当前页面 */
  pageId: PageId;
  /** 页面标题 i18n key（跟随页面） */
  titleKey: I18nKey;
  /** 复制标签时注入的初始状态快照（可选） */
  initialState?: unknown;
}

/** 当前标签内容子树上下文：携带标签 id 与该标签的初始快照 */
interface TabScope {
  id: string;
  initialState: unknown;
}

const TabContext = createContext<TabScope | null>(null);

/** 标签管理上下文 */
interface TabManagerValue {
  tabs: TabDef[];
  activeId: string;
  openTab: (pageId?: PageId, initialState?: unknown) => string;
  closeTab: (id: string) => Promise<void>;
  duplicateTab: (id: string) => void;
  activate: (id: string) => void;
  /** 修改指定标签的页面（侧边栏导航：修改当前激活标签，不新建） */
  setTabPage: (id: string, pageId: PageId) => void;
  /** 注册页面状态快照 getter（复制标签用）；返回注销函数 */
  registerSnapshot: (id: string, pageId: PageId, getter: () => unknown) => () => void;
}

const ManagerContext = createContext<TabManagerValue | null>(null);

let tabSeq = 0;
const newTabId = () => `tab-${++tabSeq}-${Date.now().toString(36)}`;

const PAGE_TITLE: Record<PageId, I18nKey> = {
  "video-convert": "nav.videoConvert",
  "audio-convert": "nav.audioConvert",
  "image-convert": "nav.imageConvert",
  "video-clip": "nav.videoClip",
  "media-info": "nav.mediaInfo",
  batch: "nav.batch",
  settings: "nav.settings",
  about: "nav.settings",
  tools: "nav.tools",
};

export function TabManagerProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<TabDef[]>(() => [
    { id: newTabId(), pageId: "settings", titleKey: PAGE_TITLE.settings },
  ]);
  const [activeId, setActiveId] = useState<string>(() => "");
  const bootedRef = useRef(false);

  // 首次挂载：激活第一个标签（副作用，放 effect 中）
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    setActiveId(tabs[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 状态快照注册表：`tabId:pageId` -> getter
  const snapshotsRef = useRef(new Map<string, () => unknown>());
  const snapKey = (id: string, pageId: PageId) => `${id}:${pageId}`;

  const openTab = useCallback((pageId: PageId = "settings", initialState?: unknown) => {
    // 上限 10 个：达到上限时拒绝新建（UI 的 + 按钮同时置灰提示），返回空串
    if (tabs.length >= MAX_TABS) return "";
    const id = newTabId();
    const tab: TabDef = {
      id,
      pageId,
      titleKey: PAGE_TITLE[pageId],
      ...(initialState !== undefined ? { initialState } : {}),
    };
    setTabs((prev) => [...prev, tab]);
    setActiveId(id);
    return id;
  }, [tabs.length]);

  const activate = useCallback((id: string) => setActiveId(id), []);

  const setTabPage = useCallback((id: string, pageId: PageId) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, pageId, titleKey: PAGE_TITLE[pageId] } : t)),
    );
  }, []);

  const registerSnapshot = useCallback(
    (id: string, pageId: PageId, getter: () => unknown) => {
      snapshotsRef.current.set(snapKey(id, pageId), getter);
      return () => {
        if (snapshotsRef.current.get(snapKey(id, pageId)) === getter) {
          snapshotsRef.current.delete(snapKey(id, pageId));
        }
      };
    },
    [],
  );

  const duplicateTab = useCallback(
    (id: string) => {
      const src = tabs.find((t) => t.id === id);
      if (!src) return;
      const getter = snapshotsRef.current.get(snapKey(id, src.pageId));
      let initialState: unknown;
      try {
        const raw = getter?.();
        initialState = raw === undefined ? undefined : structuredClone(raw);
      } catch {
        initialState = undefined;
      }
      openTab(src.pageId, initialState);
    },
    [tabs, openTab],
  );

  const closeTab = useCallback(async (id: string) => {
    setTabs((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // 激活标签被关闭时：自动激活相邻标签；若全空则重建一个设置标签
  useEffect(() => {
    if (tabs.length === 0) {
      openTab("settings");
      return;
    }
    if (!tabs.some((t) => t.id === activeId)) {
      setActiveId(tabs[tabs.length - 1].id);
    }
  }, [tabs, activeId, openTab]);

  const value = useMemo<TabManagerValue>(
    () => ({ tabs, activeId, openTab, closeTab, duplicateTab, activate, setTabPage, registerSnapshot }),
    [tabs, activeId, openTab, closeTab, duplicateTab, activate, setTabPage, registerSnapshot],
  );

  return <ManagerContext.Provider value={value}>{children}</ManagerContext.Provider>;
}

/** 标签管理上下文（tabs 列表 / 增删复制 / 导航） */
export function useTabManager(): TabManagerValue {
  const ctx = useContext(ManagerContext);
  if (!ctx) throw new Error("useTabManager must be used within TabManagerProvider");
  return ctx;
}

/** 当前标签 id（标签内容子树内使用；无上下文时返回 ""） */
export function useTabId(): string {
  return useContext(TabContext)?.id ?? "";
}

/** 为标签内容子树提供当前标签 id + 初始快照 */
export function TabIdProvider({ tab, children }: { tab: TabDef; children: ReactNode }) {
  const scope = useMemo<TabScope>(() => ({ id: tab.id, initialState: tab.initialState }), [tab.id, tab.initialState]);
  return <TabContext.Provider value={scope}>{children}</TabContext.Provider>;
}

/**
 * 页面状态快照注册 hook（复制标签用）：
 * - 传入读取当前页面状态的函数（通常用 ref 聚合最新状态）
 * - 挂载时按 `tabId:pageId` 注册；卸载时自动注销
 */
export function useRegisterPageSnapshot(pageId: PageId, getter: () => unknown): void {
  const { registerSnapshot } = useTabManager();
  const tabId = useTabId();
  const getterRef = useRef(getter);
  getterRef.current = getter;
  const stableGetter = useCallback(() => getterRef.current(), []);

  useEffect(() => {
    if (!tabId) return;
    return registerSnapshot(tabId, pageId, stableGetter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, pageId, registerSnapshot]);
}

/**
 * 读取当前标签的初始状态快照（复制标签时注入；普通新建为 undefined）。
 * 页面挂载时用其初始化 useState。
 */
export function useTabInitialState<T>(): T | undefined {
  return (useContext(TabContext)?.initialState as T | undefined) ?? undefined;
}
