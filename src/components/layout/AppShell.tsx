import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Clapperboard,
  Film,
  Image as ImageIcon,
  LayoutGrid,
  ListVideo,
  Scissors,
  Settings,
  AudioLines,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useSettings } from "@/settings/SettingsProvider";
import { hasOpenDialog, closeTopDialog } from "@/lib/dialogRegistry";
import { TaskBottomBar, type LogPanelState } from "@/components/task/TaskBottomBar";
import { CustomTitleBar } from "@/components/layout/CustomTitleBar";
import { TabBar } from "@/components/layout/TabBar";
import { BackgroundLayer } from "@/components/layout/BackgroundLayer";
import { PageStack } from "@/components/layout/PageStack";
import { TabIdProvider, useTabManager } from "@/tabs/TabManager";
import { useTasks } from "@/tasks/TaskProvider";
import type { PageId } from "@/types";

export const NAV_ITEMS: {
  id: PageId;
  icon: typeof Film;
  labelKey: "nav.videoConvert" | "nav.audioConvert" | "nav.imageConvert" | "nav.videoClip" | "nav.mediaInfo" | "nav.batch" | "nav.settings";
}[] = [
  { id: "video-convert", icon: Film, labelKey: "nav.videoConvert" },
  { id: "audio-convert", icon: AudioLines, labelKey: "nav.audioConvert" },
  { id: "image-convert", icon: ImageIcon, labelKey: "nav.imageConvert" },
  { id: "video-clip", icon: Scissors, labelKey: "nav.videoClip" },
  { id: "media-info", icon: ListVideo, labelKey: "nav.mediaInfo" },
  { id: "batch", icon: LayoutGrid, labelKey: "nav.batch" },
  { id: "settings", icon: Settings, labelKey: "nav.settings" },
];

export interface AppShellProps {
  page: PageId;
  onNavigate: (page: PageId) => void;
  /** 按页面 id 渲染页面内容（PageStack 内部按需调用并缓存） */
  renderPage: (page: PageId) => ReactNode;
}

export function AppShell({ page, onNavigate, renderPage }: AppShellProps) {
  const { t } = useI18n();
  const { settings, update } = useSettings();
  const { tabs, activeId, activate } = useTabManager();
  const { taskTabMap } = useTasks();
  // 收起状态以持久化配置为准（快捷键 A/← 收起、D/→ 展开，重启保持）
  const collapsed = settings?.sidebarCollapsed ?? false;
  const setCollapsed = (c: boolean) => update({ sidebarCollapsed: c });

  // 运行日志面板三态：以持久化配置为准（Tab 快捷键控制，重启保持）
  const logPanelState: LogPanelState = settings?.logPanelState ?? "collapsed";
  const setLogPanelState = (s: LogPanelState) => update({ logPanelState: s });

  // 悬停预览：每个标签内容区根节点引用
  const contentRefs = useRef(new Map<string, HTMLElement | null>());

  // 标签是否有关联任务（运行/排队中）：关闭需确认
  const tabHasTasks = useMemo(
    () => (tabId: string) => {
      for (const [, owner] of taskTabMap) {
        if (owner === tabId) return true;
      }
      return false;
    },
    [taskTabMap],
  );

  // Tab 定时器闭包内读取最新状态用的 refs
  const logPanelStateRef = useRef<LogPanelState>(logPanelState);
  logPanelStateRef.current = logPanelState;
  const prevVisibleRef = useRef<LogPanelState>("collapsed");

  const items = useMemo(() => NAV_ITEMS, []);

  // —— 全局快捷键 ——
  // 导航切换：W/S/↑/↓ 循环切换；收起/展开：A/← 收起、D/→ 展开。
  // 日志面板：单按 Tab 切换 展开↔收起；300ms 内双击 Tab 完全隐藏 / 恢复显示。
  // 输入框（input/textarea/select/contentEditable）聚焦时全部屏蔽。
  useEffect(() => {
    const isEditableTarget = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      return (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        el.isContentEditable
      );
    };

    // Tab 双击判定：记录上次 Tab 时间与单按定时器
    const lastTabRef = { at: 0, timer: 0 as unknown as ReturnType<typeof setTimeout> | null };

    const onKeyDown = (e: KeyboardEvent) => {
      // 输入框聚焦：屏蔽全部快捷键，保留原生 Tab 焦点跳转
      if (isEditableTarget(e.target)) return;

      // Tab：运行日志面板 展开/收起/隐藏
      if (e.key === "Tab") {
        e.preventDefault();
        const now = Date.now();
        if (now - lastTabRef.at <= 300 && lastTabRef.at > 0) {
          // 双击 Tab：完全隐藏 / 恢复显示
          if (lastTabRef.timer) clearTimeout(lastTabRef.timer);
          lastTabRef.timer = null;
          lastTabRef.at = 0; // 三击退回单按语义
          if (logPanelStateRef.current === "hidden") {
            setLogPanelState(prevVisibleRef.current ?? "collapsed");
          } else {
            prevVisibleRef.current = logPanelStateRef.current;
            setLogPanelState("hidden");
          }
        } else {
          // 单按 Tab：300ms 内无第二次则执行 展开↔收起
          lastTabRef.at = now;
          if (lastTabRef.timer) clearTimeout(lastTabRef.timer);
          lastTabRef.timer = setTimeout(() => {
            lastTabRef.timer = null;
            const cur = logPanelStateRef.current;
            if (cur === "hidden") {
              // 隐藏状态下单按 Tab：恢复显示为收起
              setLogPanelState("collapsed");
            } else {
              setLogPanelState(cur === "expanded" ? "collapsed" : "expanded");
            }
          }, 320);
        }
        return;
      }

      // 导航上下循环切换
      const isUp = e.key === "w" || e.key === "W" || e.key === "ArrowUp";
      const isDown = e.key === "s" || e.key === "S" || e.key === "ArrowDown";
      if (isUp || isDown) {
        e.preventDefault();
        const cur = items.findIndex((it) => it.id === page);
        if (cur === -1) return;
        const n = items.length;
        const next =
          isUp ? (cur - 1 + n) % n : (cur + 1) % n;
        onNavigate(items[next].id);
        return;
      }

      // 收起 / 展开
      const isCollapse = e.key === "a" || e.key === "A" || e.key === "ArrowLeft";
      const isExpand = e.key === "d" || e.key === "D" || e.key === "ArrowRight";
      if (isCollapse) {
        e.preventDefault();
        setCollapsed(true);
      } else if (isExpand) {
        e.preventDefault();
        setCollapsed(false);
        return;
      }

      // Q/E：切换上一个/下一个标签（多标签管理）
      const isPrevTab = e.key === "q" || e.key === "Q";
      const isNextTab = e.key === "e" || e.key === "E";
      if (isPrevTab || isNextTab) {
        if (tabs.length > 1) {
          e.preventDefault();
          const idx = tabs.findIndex((tb) => tb.id === activeId);
          if (idx !== -1) {
            const n = tabs.length;
            const next = isPrevTab ? (idx - 1 + n) % n : (idx + 1) % n;
            activate(tabs[next].id);
          }
        }
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (lastTabRef.timer) clearTimeout(lastTabRef.timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, items, onNavigate, tabs, activeId, activate]);

  // —— 全局 ESC 快捷键（capture 阶段拦截，优先于 Base UI 弹窗原生 ESC 关闭）——
  // 优先级：① 输入框聚焦→全不执行 ② 有弹窗→关最顶层弹窗 ③ /about→返回设置 ④ 其它→无响应。
  // 绝不关闭主窗口。
  useEffect(() => {
    const isEditableTarget = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      return (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        el.isContentEditable
      );
    };

    const onEscCapture = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // ① 有弹窗打开：关闭最顶层弹窗（模态弹窗 ESC 关闭是标准行为，优先于输入框防误触——
      //    弹窗内输入框聚焦时 ESC 也应能关掉弹窗）
      if (hasOpenDialog()) {
        e.stopImmediatePropagation();
        e.preventDefault();
        closeTopDialog();
        return;
      }
      // ② 输入框聚焦：阻止 Base UI 原生 ESC 处理，且不做任何关闭/返回（页面级防误触）
      if (isEditableTarget(e.target)) {
        e.stopImmediatePropagation();
        e.preventDefault();
        return;
      }
      // ③ 位于 /about：返回设置页（保留过渡动画，等价点击「返回设置」）
      if (page === "about") {
        e.stopImmediatePropagation();
        e.preventDefault();
        onNavigate("settings");
        return;
      }
      // ④ 其它：无任何响应（不拦截，也不做任何事）
    };

    window.addEventListener("keydown", onEscCapture, true);
    return () => window.removeEventListener("keydown", onEscCapture, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, onNavigate]);

  // —— 选中指示条（平滑移动）——
  // 竖条作为独立绝对定位元素，用 translateY 移动，避免触发布局
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState({ top: 0, height: 0 });
  // 初始化加载时不播移动动画，只有切换菜单才动画
  const [ready, setReady] = useState(false);

  // 首次挂载：定位到当前激活项，不播动画
  useEffect(() => {
    const btn = itemRefs.current.get(page);
    if (btn) {
      setIndicator({ top: btn.offsetTop, height: btn.offsetHeight });
    }
    // 下一帧启用动画过渡
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 切换菜单：播放平滑移动动画
  useEffect(() => {
    if (!ready) return;
    const btn = itemRefs.current.get(page);
    if (btn) {
      setIndicator({ top: btn.offsetTop, height: btn.offsetHeight });
    }
  }, [page, ready]);

  // 窗口缩放 / 侧栏折叠变化：位置自动跟随，不播动画
  useEffect(() => {
    const onResize = () => {
      const btn = itemRefs.current.get(page);
      if (btn) {
        setIndicator({ top: btn.offsetTop, height: btn.offsetHeight });
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [page, collapsed]);

  return (
    <div
      data-slot="shell-root"
      data-panel-effect={settings?.panelEffect ?? "blur"}
      className={cn(
        // flex-col：标题栏在上、主体在下；开启自定义背景时根容器透明，背景图铺满全窗（含标题栏区）
        "relative isolate flex h-screen w-screen flex-col overflow-hidden text-foreground",
        settings?.backgroundEnabled ? "bg-transparent" : "bg-background",
        // 开启自定义背景时：功能卡片/侧边栏/日志面板半透明磨砂（CSS 后代选择器生效）
        settings?.backgroundEnabled && "bg-glass-enabled",
      )}
      style={
        settings?.backgroundEnabled
          ? {
              // 两个独立透明度参数 → CSS 变量（0-1）；侧边栏/日志共用 chrome-alpha
              "--panel-alpha": Math.min(100, Math.max(0, settings.panelOpacity ?? 100)) / 100,
              "--chrome-alpha": Math.min(100, Math.max(0, settings.chromeOpacity ?? 100)) / 100,
            } as CSSProperties
          : undefined
      }
    >
      {/* 自定义背景层：z-0 最底层，UI 全部在其上层（负 z-index + isolate 父容器） */}
      <BackgroundLayer />
      {/* 自制顶部标题栏：硬件监控 + 多标签栏 + 最小化/最大化/关闭 + 拖拽区 */}
      <CustomTitleBar tabBar={<TabBar contentRefs={contentRefs} tabHasTasks={tabHasTasks} />} />
      {/* 主体：左侧导航 + 右侧内容区 */}
      <div className="flex min-h-0 flex-1">
        {/* 左侧导航 */}
      <nav
        data-slot="sidebar"
        className={cn(
          "flex shrink-0 flex-col border-r border-border bg-muted/30 transition-all duration-200",
          collapsed ? "w-12" : "w-56",
        )}
      >
        {/* 应用标题 */}
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
          <Clapperboard className="size-6 shrink-0 text-primary" />
          {!collapsed && (
            <span className="truncate text-sm font-semibold">{t("app.name")}</span>
          )}
        </div>

        {/* 导航项（relative 容器，指示条在此定位） */}
        <div ref={listRef} className="relative flex-1 overflow-y-auto py-2">
          {/* 选中指示条（平滑移动，280ms ease-out） */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 w-0.5 rounded-r bg-primary"
            style={{
              top: 0,
              height: indicator.height,
              transform: `translateY(${indicator.top}px)`,
              transition: ready
                ? "transform 280ms cubic-bezier(0, 0, 0.2, 1)"
                : "none",
            }}
          />

          {items.map((item) => {
            const Icon = item.icon;
            const active = page === item.id;
            return (
              <button
                key={item.id}
                ref={(el) => {
                  if (el) itemRefs.current.set(item.id, el);
                }}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={cn(
                  "group flex w-full items-center gap-3 border-l-2 px-3 py-2.5 text-sm transition-colors hover:bg-accent",
                  active
                    ? "border-l-transparent bg-accent font-medium text-foreground"
                    : "border-l-transparent text-muted-foreground",
                )}
                title={collapsed ? t(item.labelKey) : undefined}
              >
                {/* 图标：颜色跟随全局强调色（--primary），选中全不透明、未选中半透；
                 hover 时小幅缩放 + 轻微透明度变化，220ms 平滑过渡（仅悬浮触发） */}
                <Icon
                  className={cn(
                    "size-5 shrink-0 text-primary transition-[transform,opacity] duration-[220ms] ease-out",
                    "group-hover:scale-[1.08] group-hover:opacity-80",
                    active ? "opacity-100" : "opacity-50",
                  )}
                />
                {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
              </button>
            );
          })}
        </div>

        {/* 折叠按钮 */}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex shrink-0 items-center justify-center border-t border-border py-2 text-xs text-muted-foreground hover:bg-accent"
        >
          {collapsed ? "→" : "←"}
        </button>
      </nav>

      {/* 右侧内容区 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* 多标签内容：全部保持挂载（状态/后台任务不丢失），激活标签可见 */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {tabs.map((tab) => {
            const isActive = tab.id === activeId;
            return (
              <TabIdProvider key={tab.id} tab={tab}>
                {/* 非激活标签用 opacity-0+inert 隐藏（保留布局），不用 display:none：
                    否则悬停预览克隆时 WebView2 不重算布局 → 缩略图空白 */}
                <div
                  ref={(el) => {
                    contentRefs.current.set(tab.id, el);
                  }}
                  data-tab-layer={tab.id}
                  inert={!isActive}
                  aria-hidden={!isActive}
                  className={cn(
                    "absolute inset-0 flex flex-col overflow-hidden transition-opacity duration-150",
                    !isActive && "pointer-events-none opacity-0",
                  )}
                >
                  <div className="min-h-0 flex-1 overflow-hidden">
                    {/* 页面堆叠：设置↔关于 左右滑动动画；其它页直切；背景层在本容器之下不动 */}
                    <PageStack page={tab.pageId} renderPage={renderPage as (id: string) => ReactNode} />
                  </div>
                  {/* 每个标签独立的任务/日志面板（按 tabId 过滤展示本标签任务） */}
                  <TaskBottomBar tabId={tab.id} state={logPanelState} onStateChange={setLogPanelState} />
                </div>
              </TabIdProvider>
            );
          })}
        </div>
      </div>
      </div>
    </div>
  );
}
