import { useMemo, useState, type ReactNode } from "react";
import {
  Clapperboard,
  Film,
  LayoutGrid,
  ListVideo,
  Scissors,
  Settings,
  AudioLines,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import type { PageId } from "@/types";

export const NAV_ITEMS: {
  id: PageId;
  icon: typeof Film;
  labelKey: "nav.videoConvert" | "nav.audioConvert" | "nav.videoClip" | "nav.mediaInfo" | "nav.batch" | "nav.settings";
}[] = [
  { id: "video-convert", icon: Film, labelKey: "nav.videoConvert" },
  { id: "audio-convert", icon: AudioLines, labelKey: "nav.audioConvert" },
  { id: "video-clip", icon: Scissors, labelKey: "nav.videoClip" },
  { id: "media-info", icon: ListVideo, labelKey: "nav.mediaInfo" },
  { id: "batch", icon: LayoutGrid, labelKey: "nav.batch" },
  { id: "settings", icon: Settings, labelKey: "nav.settings" },
];

export interface AppShellProps {
  page: PageId;
  onNavigate: (page: PageId) => void;
  children: ReactNode;
}

/**
 * 模块一：基础外壳（左侧导航 + 中间内容区）。
 * 模块二将在此基础上扩展底部任务栏、头部状态区，形成完整三栏布局。
 */
export function AppShell({ page, onNavigate, children }: AppShellProps) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);

  const items = useMemo(() => NAV_ITEMS, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* 左侧导航栏 */}
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200",
          collapsed ? "w-14" : "w-52",
        )}
      >
        {/* Logo 区 */}
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-3.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Clapperboard className="size-4.5" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold leading-tight">
                {t("app.name")}
              </div>
              <div className="truncate text-[11px] leading-tight text-muted-foreground">
                {t("app.subtitle")}
              </div>
            </div>
          )}
        </div>

        {/* 导航项 */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {items.map((item) => {
            const Icon = item.icon;
            const active = page === item.id;
            return (
              <button
                key={item.id}
                type="button"
                title={collapsed ? t(item.labelKey) : undefined}
                onClick={() => onNavigate(item.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary font-medium text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  collapsed && "justify-center px-0",
                )}
              >
                <Icon className="size-4.5 shrink-0" />
                {!collapsed && (
                  <span className="truncate">{t(item.labelKey)}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* 底部折叠按钮 */}
        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex w-full items-center justify-center gap-2 rounded-md px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <ChevronsIcon collapsed={collapsed} />
            {!collapsed && <span>{t("app.collapseNav")}</span>}
          </button>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}

function ChevronsIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-4 transition-transform", collapsed && "rotate-180")}
    >
      <path d="m11 17-5-5 5-5" />
      <path d="m18 17-5-5 5-5" />
    </svg>
  );
}