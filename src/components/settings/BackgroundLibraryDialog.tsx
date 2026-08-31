import { useCallback, useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Trash2, Film, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useSettings } from "@/settings/SettingsProvider";
import { api } from "@/lib/tauri";
import type { BackgroundFile } from "@/types";

const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp"];

function isImage(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTS.includes(ext);
}

function isVideo(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ["mp4", "webm"].includes(ext);
}

/** 双保险：后端已过滤，前端再过滤一次，确保仅 png/jpg/jpeg/webp/mp4/webm 显示 */
function isSupported(name: string): boolean {
  return isImage(name) || isVideo(name);
}

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * 自定义图库二级弹窗：
 * - 扫描软件根目录 Background 文件夹（仅 png/jpg/jpeg/webp/mp4/webm）
 * - 图片缩略预览；视频显示首帧，鼠标悬浮小窗播放
 * - 点击素材直接设为当前背景（不必关闭窗口）
 * - 支持删除（同时从 Background 文件夹移除文件）
 */
export function BackgroundLibraryDialog({ open, onClose }: Props) {
  const { t } = useI18n();
  const { settings, update } = useSettings();
  const [files, setFiles] = useState<BackgroundFile[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setFiles(await api.backgroundList());
    } catch {
      setFiles([]);
    }
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const select = (f: BackgroundFile) => {
    // 直接设为当前背景；窗口保持打开，可继续挑选
    update({ backgroundFile: f.name, backgroundEnabled: true });
  };

  const remove = async (f: BackgroundFile) => {
    if (!confirm(t("settings.appearance.bgDeleteConfirm"))) return;
    try {
      await api.backgroundDelete(f.name);
      // 删除的是当前使用中的背景 → 自动恢复默认背景并提示
      if (settings?.backgroundFile === f.name) {
        update({ backgroundFile: null, backgroundEnabled: false });
        toast.info(t("settings.appearance.bgDeleteCurrent"));
      }
      await refresh();
    } catch {
      toast.error(t("settings.appearance.bgDeleteErr"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="flex max-h-[92vh] w-[min(92vw,960px)] flex-col gap-3 overflow-hidden p-4 sm:max-w-none"
        data-resizable
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{t("settings.appearance.bgLibraryTitle")}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {files.length === 0 ? (
            <p className="py-14 text-center text-sm text-muted-foreground">
              {t("settings.appearance.bgLibraryEmpty")}
            </p>
          ) : (
            /* 网格自适应：窗口拉大 → 单格跟随变大（auto-fill + minmax） */
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
              {files.filter((f) => isSupported(f.name)).map((f) => {
                const img = isImage(f.name);
                return (
                  <div
                    key={f.name}
                    className="group relative aspect-video overflow-hidden rounded-lg border border-border bg-muted"
                  >
                    {/* 点击素材设为当前背景 */}
                    <button
                      type="button"
                      onClick={() => select(f)}
                      className="absolute inset-0 z-10"
                      aria-label={f.name}
                      title={f.name}
                    >
                      <span className="sr-only">{f.name}</span>
                    </button>

                    {/* 缩略预览：图片直接显示；视频首帧 + 悬浮播放 */}
                    {img ? (
                      <img
                        src={convertFileSrc(f.path)}
                        alt={f.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        draggable={false}
                      />
                    ) : (
                      <video
                        src={convertFileSrc(f.path)}
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        onMouseEnter={(e) => {
                          setHovered(f.name);
                          e.currentTarget.play().catch(() => {});
                        }}
                        onMouseLeave={(e) => {
                          setHovered(null);
                          e.currentTarget.pause();
                          e.currentTarget.currentTime = 0;
                        }}
                        className="h-full w-full object-cover"
                      />
                    )}

                    {/* 视频角标 */}
                    {!img && (
                      <span className="absolute right-1 bottom-1 z-20 flex items-center gap-0.5 rounded bg-black/60 px-1 py-0.5 text-[10px] text-white">
                        <Film className="size-3" />
                        {hovered === f.name ? "" : "video"}
                      </span>
                    )}

                    {/* 删除按钮 */}
                    <button
                      type="button"
                      onClick={() => void remove(f)}
                      aria-label={t("settings.appearance.bgDelete")}
                      title={t("settings.appearance.bgDelete")}
                      className="absolute top-1 right-1 z-20 rounded bg-black/50 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-600"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            <X className="size-4" />
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}