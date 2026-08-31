import { useEffect, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, Copy, X } from "lucide-react";

interface HardwareStats {
  gpu: number;
  cpu: number;
  memory: number;
}

/**
 * 自制顶部标题栏（decorations: false 后替代系统标题栏）：
 * - 左侧：项目软件 ICO 图标 + 软件名称 + 实时硬件文字 GPU/CPU/MEM（Rust 后端事件推送，每 1s 刷新）
 * - 中间：标签栏（多标签管理，位于硬件状态右侧；拖拽区让位给标签栏）
 * - 右侧：最小化 / 最大化还原 / 关闭 三按钮（自制 UI，调用 Tauri window API）
 * - 最大化状态同步：图标切换「还原」（Copy）↔「最大化」（Square）；最大化时禁拖拽由系统保证
 * - 透明度：data-slot="titlebar" 跟随 chrome 透明度与面板效果（见 index.css）
 */
export function CustomTitleBar({ tabBar }: { tabBar?: React.ReactNode }) {
  const [stats, setStats] = useState<HardwareStats>({ gpu: 0, cpu: 0, memory: 0 });
  const [isMax, setIsMax] = useState(false);
  const win = getCurrentWindow();

  // 监听 Rust 后端硬件事件（spawn_title_updater 每 1000ms emit）
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    void listen<HardwareStats>("hardware-stats", (e) => {
      setStats({ gpu: Math.round(e.payload.gpu ?? 0), cpu: Math.round(e.payload.cpu ?? 0), memory: Math.round(e.payload.memory ?? 0) });
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  // 窗口最大化状态同步（图标切换 + 布局）
  useEffect(() => {
    let alive = true;
    void win.isMaximized().then((m) => {
      if (alive) setIsMax(m);
    });
    let unlisten: UnlistenFn | undefined;
    void win.onResized(async () => {
      const m = await win.isMaximized();
      if (alive) setIsMax(m);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, [win]);

  const safe = (fn: () => Promise<unknown>) => () => {
    try {
      void fn().catch(() => {});
    } catch {
      /* 忽略 */
    }
  };

  return (
    <div
      data-tauri-drag-region
      data-slot="titlebar"
      className="flex h-9 shrink-0 items-center gap-3 border-b border-border/60 px-3 text-xs text-muted-foreground select-none"
    >
      {/* 左侧：标题栏 GIF 图标 + 实时硬件文字（事件渲染）；整块可拖拽窗口 */}
      <div data-tauri-drag-region className="flex h-full shrink-0 items-center gap-2">
        <img
          src="/app-icon.gif"
          alt=""
          draggable={false}
          className="size-4 shrink-0 select-none"
        />
      </div>

      <div data-tauri-drag-region className="flex h-full shrink-0 items-center gap-2.5 pl-1">
        <span data-tauri-drag-region className="font-medium tabular-nums">
          GPU <span className="text-foreground">{stats.gpu}%</span>
        </span>
        <span data-tauri-drag-region className="font-medium tabular-nums">
          CPU <span className="text-foreground">{stats.cpu}%</span>
        </span>
        <span data-tauri-drag-region className="font-medium tabular-nums">
          MEM <span className="text-foreground">{stats.memory}%</span>
        </span>
      </div>

      {/* 标签栏（位于硬件状态右侧；+ 按钮与标签项为交互元素不触发拖拽，空白区可拖拽窗口） */}
      {tabBar ?? <div data-tauri-drag-region className="min-w-0 flex-1" />}

      {/* 窗口控制按钮（不带 data-tauri-drag-region → 点击不触发拖拽） */}
      <div className="flex h-full shrink-0 items-stretch">
        <button
          type="button"
          aria-label="Minimize"
          onClick={safe(() => win.minimize())}
          className="flex w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Minus className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Maximize"
          onClick={safe(() => win.toggleMaximize())}
          className="flex w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {isMax ? <Copy className="size-3.5" /> : <Square className="size-3" />}
        </button>
        <button
          type="button"
          aria-label="Close"
          onClick={safe(() => win.close())}
          className="flex w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}