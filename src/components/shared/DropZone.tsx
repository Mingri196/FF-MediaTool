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

/**
 * 全功能主操作区拖拽导入（v0.20 修复版）。
 *
 * 关键修复：Tauri WebView2 中 HTML5 drag-drop 的 dataTransfer.files 不可靠，
 * 改用 Tauri 原生 `getCurrentWebview().onDragDropEvent` 获取真实文件路径。
 * - HTML5 事件仅用于 preventDefault（阻止 WebView 打开文件）与高亮反馈
 * - 'drop' 事件通过 Tauri payload.paths 拿到路径 → 触发 onFiles
 * - 支持批量拖拽；按 accept 分级校验扩展名（video/audio/all）
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
  const overlayCount = useRef(0);

  // Tauri 原生拖拽事件（路径来源）
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    (async () => {
      const wv = getCurrentWebview();
      unlisten = await wv.onDragDropEvent((e) => {
        if (disposed) return;
        if (e.payload.type === "enter" || e.payload.type === "over") {
          overlayCount.current = 1;
          setDragging(true);
        } else if (e.payload.type === "leave") {
          overlayCount.current = 0;
          setDragging(false);
        } else if (e.payload.type === "drop") {
          overlayCount.current = 0;
          setDragging(false);
          const paths = e.payload.paths ?? [];
          if (paths.length === 0) {
            toast.error(t("drop.noPaths"));
            return;
          }
          const valid = new Set(paths);
          const accepted = EXTS[acceptRef.current];
          const rejected: string[] = [];
          const ok: string[] = [];
          for (const p of valid) {
            const ext = p.split(".").pop()?.toLowerCase() ?? "";
            if (!accepted.has(ext)) rejected.push(p.split(/[\\/]/).pop() ?? p);
            else ok.push(p);
          }
          if (rejected.length > 0) {
            toast.error(t(LABEL_KEYS[acceptRef.current], { names: rejected.join(", ") }));
          }
          if (ok.length > 0) onFilesRef.current(ok);
        }
      });
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // HTML5 事件：仅阻止默认行为（避免打开文件）+ 兜底高亮
  const prevent = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const enter = (e: React.DragEvent) => {
    prevent(e);
    overlayCount.current++;
    setDragging(true);
  };
  const leave = (e: React.DragEvent) => {
    prevent(e);
    overlayCount.current = Math.max(0, overlayCount.current - 1);
    if (overlayCount.current === 0) setDragging(false);
  };
  const over = (e: React.DragEvent) => {
    prevent(e);
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  };
  const dropFallback = (e: React.DragEvent) => {
    prevent(e);
    overlayCount.current = 0;
    setDragging(false);
    // HTML5 兜底：仅当 Tauri 事件未提供路径时读取 files（部分环境仍有 .path 扩展）
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) {
      const paths = files
        .map((f) => (f as unknown as { path?: string }).path)
        .filter((p): p is string => !!p);
      if (paths.length > 0) {
        const accepted = EXTS[acceptRef.current];
        const rejected: string[] = [];
        const ok = paths.filter((p) => {
          const ext = p.split(".").pop()?.toLowerCase() ?? "";
          const good = accepted.has(ext);
          if (!good) rejected.push(p.split(/[\\/]/).pop() ?? p);
          return good;
        });
        if (rejected.length > 0) toast.error(t(LABEL_KEYS[acceptRef.current], { names: rejected.join(", ") }));
        if (ok.length > 0) onFilesRef.current(ok);
      }
    }
  };

  return (
    <div
      className={cn("relative", className)}
      onDragEnter={enter}
      onDragOver={over}
      onDragLeave={leave}
      onDrop={dropFallback}
    >
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