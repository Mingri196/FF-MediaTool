import { useMemo, useState, type ReactNode } from "react";
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
import { TaskBottomBar } from "@/components/task/TaskBottomBar";
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
  children: ReactNode;
}

export function AppShell({ page, onNavigate, children }: AppShellProps) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);

  const items = useMemo(() => NAV_ITEMS, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* 左侧导航 */}
      <nav
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

        {/* 导航项 */}
        <div className="flex-1 overflow-y-auto py-2">
          {items.map((item) => {
            const Icon = item.icon;
            const active = page === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={cn(
                  "flex w-full items-center gap-3 border-l-2 px-3 py-2.5 text-sm transition-colors hover:bg-accent",
                  active
                    ? "border-l-primary bg-accent font-medium text-foreground"
                    : "border-l-transparent text-muted-foreground",
                )}
                title={collapsed ? t(item.labelKey) : undefined}
              >
                <Icon className="size-5 shrink-0" />
                {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
              </button>
            );
          })}
        </div>

        {/* 折叠按钮 */}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex shrink-0 items-center justify-center border-t border-border py-2 text-xs text-muted-foreground hover:bg-accent"
        >
          {collapsed ? "→" : "←"}
        </button>
      </nav>

      {/* 右侧内容区 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        <TaskBottomBar />
      </div>
    </div>
  );
}