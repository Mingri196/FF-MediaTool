import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, X, Copy, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { MAX_TABS, useTabManager } from "@/tabs/TabManager";
import { useTasks } from "@/tasks/TaskProvider";

interface TabBarProps {
  /** 每个标签内容区根节点（悬停预览时克隆其 DOM 渲染缩略） */
  contentRefs?: React.MutableRefObject<Map<string, HTMLElement | null>>;
  /** 标签是否有关联任务运行（关闭时需确认） */
  tabHasTasks?: (tabId: string) => boolean;
}

/** 悬停预览弹窗：渲染标签内容区 DOM 克隆的缩略图（只读，不可交互）。
 * 源节点可能是 hidden（display:none）的非激活标签，scrollWidth 为 0，
 * 因此以窗口为参考尺寸显式设定克隆体宽高、去掉 hidden 状态，并移除运行日志面板。 */
function TabPreview({ node, anchor }: { node: HTMLElement; anchor: { left: number; top: number } | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 260, h: 146 });
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    host.innerHTML = "";
    const clone = node.cloneNode(true) as HTMLElement;
    // 清理源节点上的隐藏状态（非激活标签是 opacity-0+inert，激活标签无；克隆体必须可见）
    clone.removeAttribute("hidden");
    clone.removeAttribute("inert");
    clone.classList.remove("hidden", "opacity-0", "pointer-events-none");
    clone.style.position = "relative";
    clone.style.left = "auto";
    clone.style.top = "auto";
    clone.style.right = "auto";
    clone.style.bottom = "auto";
    // 保留 flex 布局（display 不覆盖）：页面区域 flex-1 才能撑满
    // 参考尺寸：窗口内容区（缩放仅用于缩略图）
    const w = window.innerWidth || 1280;
    const h = window.innerHeight || 720;
    clone.style.width = `${w}px`;
    clone.style.height = `${h}px`;
    clone.style.overflow = "hidden";
    clone.style.pointerEvents = "none";
    // 移除运行日志面板：缩略图只显示页面主体
    clone.querySelector('[data-slot="taskbar"]')?.remove();
    // 预览容器 16:9，等比缩放
    const scale = Math.min(280 / w, 158 / h, 0.35);
    clone.style.transformOrigin = "0 0";
    clone.style.transform = `scale(${scale})`;
    host.appendChild(clone);
    setSize({ w: Math.round(w * scale), h: Math.round(h * scale) });
  }, [node]);

  // 定位：优先在标签下方弹出，超出视口则上移
  const style: React.CSSProperties = {};
  if (anchor) {
    const left = Math.min(anchor.left, window.innerWidth - size.w - 8);
    const below = anchor.top + 34;
    const top = below + size.h > window.innerHeight ? Math.max(anchor.top - size.h - 6, 4) : below;
    style.left = left;
    style.top = top;
  } else {
    style.left = 8;
    style.top = 40;
  }

  return (
    <div
      className="pointer-events-none fixed z-[999] overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
      style={{ width: size.w, height: size.h, ...style }}
    >
      <div ref={ref} className="origin-top-left overflow-hidden" />
    </div>
  );
}

export function TabBar({ contentRefs, tabHasTasks }: TabBarProps) {
  const { t } = useI18n();
  const { tabs, activeId, openTab, closeTab, duplicateTab, activate } = useTabManager();
  const { stopTabTasks } = useTasks();
  const scrollRef = useRef<HTMLDivElement>(null);

  // 悬停预览状态（携带标签锚点用于定位）
  const [preview, setPreview] = useState<{ tabId: string; node: HTMLElement; anchor: { left: number; top: number } | null } | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 右键菜单状态
  const [menu, setMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);

  // 关闭确认（有关联运行任务时）
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null);

  const closePreview = useCallback(() => setPreview(null), []);

  const schedulePreview = useCallback((tabId: string, el?: HTMLElement) => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      const node = contentRefs?.current.get(tabId) ?? null;
      if (!node) return;
      let anchor: { left: number; top: number } | null = null;
      if (el) {
        const r = el.getBoundingClientRect();
        anchor = { left: r.left, top: r.top };
      }
      setPreview({ tabId, node, anchor });
    }, 350);
  }, [contentRefs]);

  const cancelPreview = useCallback(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    closePreview();
  }, [closePreview]);

  useEffect(() => () => { if (previewTimer.current) clearTimeout(previewTimer.current); }, []);

  // 滚轮横向滚动
  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!scrollRef.current) return;
    e.preventDefault();
    scrollRef.current.scrollLeft += e.deltaY > 0 ? 40 : -40;
  }, []);

  // 右键菜单关闭（点其它处 / ESC）
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onEsc);
    };
  }, [menu]);

  const onlyOne = tabs.length === 1;

  /** 统一关闭入口：有关联任务则弹确认，否则直接关闭 */
  const requestClose = useCallback((tabId: string) => {
    if (tabHasTasks?.(tabId)) {
      setConfirmCloseId(tabId);
      return;
    }
    void closeTab(tabId);
  }, [tabHasTasks, closeTab]);

  return (
    <div
      data-slot="tabbar"
      data-tauri-drag-region
      className="flex h-full min-w-0 flex-1 items-stretch"
      onWheel={onWheel}
    >
      {/* + 新建标签 */}
      <button
        type="button"
        title={t("tab.new")}
        disabled={tabs.length >= MAX_TABS}
        onClick={() => openTab("settings")}
        className="flex h-full shrink-0 items-center justify-center border-r border-border/60 px-2.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
      >
        <Plus className="size-3.5" />
      </button>

      {/* 标签列表（横向滚动）；空白区可拖拽窗口，标签项/按钮为交互元素不拖拽 */}
      <div ref={scrollRef} data-tauri-drag-region className="flex min-w-0 flex-1 items-stretch overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              role="tab"
              aria-selected={active}
              onMouseDown={(e) => {
                // 标签项不是 Tauri 默认豁免的交互元素，阻止 mousedown 冒泡以避免触发 drag region 拖拽
                e.stopPropagation();
              }}
              onMouseEnter={(e) => schedulePreview(tab.id, e.currentTarget)}
              onMouseLeave={cancelPreview}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, tabId: tab.id });
              }}
              onClick={() => activate(tab.id)}
              className={cn(
                "group relative flex h-full shrink-0 cursor-pointer select-none items-center gap-1 border-r border-border/60 px-2.5 text-xs transition-colors",
                active
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <span className="max-w-28 truncate">{t(tab.titleKey)}</span>
              <button
                type="button"
                title={t("tab.close")}
                disabled={onlyOne}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!onlyOne) requestClose(tab.id);
                }}
                className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/15 hover:text-foreground group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-30"
              >
                <X className="size-3" />
              </button>
              <span
                className={cn(
                  "pointer-events-none absolute inset-x-0 bottom-0 h-0.5",
                  active ? "bg-primary" : "bg-transparent",
                )}
              />
            </div>
          );
        })}
      </div>

      {/* 右键菜单 */}
      {menu && (
        <div
          className="fixed z-[1000] w-44 overflow-hidden rounded-md border border-border bg-popover py-1 text-sm shadow-lg"
          style={{ left: Math.min(menu.x, window.innerWidth - 190), top: Math.min(menu.y, window.innerHeight - 100) }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent"
            onClick={() => {
              duplicateTab(menu.tabId);
              setMenu(null);
            }}
          >
            <Copy className="size-3.5" />
            {t("tab.duplicate")}
          </button>
          <button
            type="button"
            disabled={onlyOne}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-destructive hover:bg-accent disabled:opacity-40"
            onClick={() => {
              if (!onlyOne) requestClose(menu.tabId);
              setMenu(null);
            }}
          >
            <Trash2 className="size-3.5" />
            {t("tab.close")}
          </button>
        </div>
      )}

      {/* 悬停预览 */}
      {preview && <TabPreview node={preview.node} anchor={preview.anchor} />}

      {/* 关闭确认弹窗：标签存在运行任务 */}
      <AlertDialog open={!!confirmCloseId} onOpenChange={(o) => !o && setConfirmCloseId(null)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("tab.closeTaskTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("tab.closeTaskConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmCloseId(null)}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmCloseId) {
                  // 终止该标签归属的运行/排队任务，再关闭标签
                  void stopTabTasks(confirmCloseId).finally(() => void closeTab(confirmCloseId));
                }
                setConfirmCloseId(null);
              }}
            >
              {t("tab.closeTaskOk")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
