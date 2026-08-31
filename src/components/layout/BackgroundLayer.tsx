import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useSettings } from "@/settings/SettingsProvider";
import { api } from "@/lib/tauri";
import { useI18n } from "@/i18n";

const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp"];
const VIDEO_EXTS = ["mp4", "webm"];

function extOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

/**
 * 自定义背景层：全窗口最底层（z-0，UI 全部在其上层）。
 * - 静态图片：铺满窗口、保持比例缩放、超出裁剪（object-cover）
 * - 视频：静音循环自动播放，最底层，绝不遮挡 UI
 * - 关闭时卸载媒体元素，停止播放释放资源
 * - 素材文件丢失：自动关闭背景并右下角提示
 */
export function BackgroundLayer() {
  const { t } = useI18n();
  const { settings, update } = useSettings();
  const [path, setPath] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const enabled = settings?.backgroundEnabled ?? false;
  const file = settings?.backgroundFile ?? null;
  const opacity = Math.min(100, Math.max(0, settings?.backgroundOpacity ?? 100)) / 100;
  const speed = settings?.backgroundVideoSpeed ?? 1;

  // 解析当前背景文件的绝对路径；文件丢失时自动降级回默认背景
  useEffect(() => {
    let cancelled = false;
    if (!enabled || !file) {
      setPath(null);
      return;
    }
    (async () => {
      try {
        const files = await api.backgroundList();
        if (cancelled) return;
        const hit = files.find((f) => f.name === file);
        if (hit) {
          setPath(hit.path);
        } else {
          // 容错降级：素材已丢失 → 关闭背景 + 提示
          setPath(null);
          update({ backgroundEnabled: false, backgroundFile: null });
          toast.error(t("settings.appearance.bgMissing"));
        }
      } catch {
        if (!cancelled) setPath(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, file]);

  // 视频播放速度实时生效
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  }, [speed, path]);

  // 关闭或非启用：不渲染任何媒体元素，视频随卸载停止并释放资源
  if (!enabled || !file || !path) return null;

  const ext = extOf(file);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background"
    >
      {IMAGE_EXTS.includes(ext) ? (
        <img
          src={convertFileSrc(path)}
          alt=""
          draggable={false}
          className="h-full w-full object-cover select-none"
          style={{ opacity }}
        />
      ) : VIDEO_EXTS.includes(ext) ? (
        <video
          ref={videoRef}
          src={convertFileSrc(path)}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          className="h-full w-full object-cover select-none"
          style={{ opacity }}
        />
      ) : null}
    </div>
  );
}