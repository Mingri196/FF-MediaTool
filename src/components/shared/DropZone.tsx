import { useEffect, useRef, useState, type ReactNode } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useI18n, type I18nKey } from "@/i18n";

/** 支持的文件类型分级（由各页面传入） */
export type DropAccept = "video" | "audio" | "all";

const VIDEO_EXTS = ["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "ts", "m4v", "mpg", "mpeg", "3gp", "mts", "m2ts", "vob"];
const AUDIO_EXTS = ["mp3", "flac", "wav", "ogg", "opus", "m4a", "aac", "wma", "aiff", "wv", "ape"];
const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "bmp", "gif"];
const SUB_EXTS = ["srt", "ass", "ssa", "vtt"];

const EXTS: Record<DropAccept, Set<string>> = {
  video: new Set([...VIDEO_EXTS, ...IMAGE_EXTS, ...SUB_EXTS]),
  audio: new Set(AUDIO_EXTS),
  all: new Set([...VIDEO_EXTS, ...AUDIO_EXTS, ...IMAGE_EXTS, ...SUB_EXTS]),
};

const LABEL_KEYS: Record<DropAccept, I18nKey> = {
  video: "drop.acceptVideo",
  audio: "drop.acceptAudio",
  all: "drop.invalid",
};

/** 热区约束：排除左侧导航栏（约 180px）与底部任务栏（约 170px） */
const NAV_WIDTH = 180;
const BOTTOM_BAR_HEIGHT = 170;

/**
 * 全功能主操作区拖拽导入（v0.20.1 修复版）。
 *
 * 关键修复：不要对 HTML5 拖拽事件调用 preventDefault —— Tauri 官方规定
 * 这会阻止 `onDragDropEvent` 触发。本组件纯走 Tauri 原生事件：
 * - enter/over  → 高亮（用事件 position 限定在主操作区内，导航/底栏不高亮）
 * - drop        → 拿真实文件路径 → 按 accept 分级校验 → 触发 onFiles
 * - leave/cancel→ 隐藏高亮
 */
export function DropZone({
  children,
  onFiles,
  accept = "all",
  className,
}: {
  children: ReactNode;
  onFiles: (paths: string[]) => void;
  accept?: DropAccept;
  className?: string;
}) {
  const { t } = useI18n();
  const [dragging, setDragging] = useState(false);
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;
  const acceptRef = useRef(accept);
  acceptRef.current = accept;

  const handlePaths = (paths: string[]) => {
    if (paths.length === 0) {
      toast.error(t("drop.noPaths"));
      return;
    }
    const accepted = EXTS[acceptRef.current];
    const rejected: string[] = [];
    const ok: string[] = [];
    const seen = new Set<string>();
    for (const p of paths) {
      if (seen.has(p)) continue;
      seen.add(p);
      const ext = p.split(".").pop()?.toLowerCase() ?? "";
      if (!accepted.has(ext)) rejected.push(p.split(/[\\/]/).pop() ?? p);
      else ok.push(p);
    }
    if (rejected.length > 0) {
      toast.error(t(LABEL_KEYS[acceptRef.current], { names: rejected.join(", ") }));
    }
    if (ok.length > 0) onFilesRef.current(ok);
  };

  const inHotZone = (x: number, y: number) =>
    x >= NAV_WIDTH && y <= window.innerHeight - BOTTOM_BAR_HEIGHT;

  // Tauri 原生拖拽事件（唯一事件来源，不做任何 preventDefault）
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        unlisten = await getCurrentWebview().onDragDropEvent((e) => {
          if (disposed) return;
          const p = e.payload;
          if (p.type === "enter" || p.type === "over") {
            const pos = p.position;
            const inZone = !pos || inHotZone(pos.x, pos.y);
            setDragging(inZone);
          } else if (p.type === "drop") {
            setDragging(false);
            handlePaths(p.paths ?? []);
          } else {
            // leave
            setDragging(false);
          }
        });
        // 测试钩子：供 E2E 确认监听已注册
        (window as unknown as Record<string, unknown>).__ffmtDropReady = true;
      } catch (err) {
        console.warn("[DropZone] Tauri drag-drop listener failed:", err);
        (window as unknown as Record<string, unknown>).__ffmtDropReady = false;
      }
    })();
    return () => {
      disposed = true;
      try { unlisten?.(); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={cn("relative", className)}>
      {children}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-primary/70 bg-background/85 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-2 text-primary">
            <Upload className="size-10 animate-bounce" />
            <span className="text-lg font-semibold">{t("drop.hint")}</span>
          </div>
        </div>
      )}
    </div>
  );
}