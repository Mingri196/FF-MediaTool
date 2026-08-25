import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useI18n, type I18nKey } from "@/i18n";

/** 支持的文件类型分级（由各页面传入；后缀校验，Windows 下 file.type 常为空） */
export type DropAccept = "video" | "audio" | "all";

const VIDEO_EXTS = ["mp4", "mkv", "avi", "mov", "flv", "wmv", "webm", "ts", "m4v", "mpg", "mpeg", "3gp", "mts", "m2ts", "vob"];
const AUDIO_EXTS = ["mp3", "aac", "flac", "wav", "ogg", "m4a", "opus", "ape", "aiff", "wma", "wv"];
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
 * 全功能主操作区拖拽导入（v0.24.1 双通道修复版）。
 *
 * 前置（重要）：`tauri.conf.json` 必须 `dragDropEnabled: true`。
 * 证据：Chromium 86+ 安全策略下，HTML5 拖拽读取本地文件路径会被替换为
 * `about:blank#blocked`；HTML5 File 也无 `.path` 注入。真实路径只有
 * Tauri 原生 `onDragDropEvent` 能拿到。
 *
 * 双通道：
 * - Tauri onDragDropEvent（主）：enter/over → 高亮；drop → 真实 paths → onFiles
 * - HTML5 事件（辅助）：仅高亮反馈（不 preventDefault，避免抑制 Tauri 事件）；
 *   仅当 Tauri 通道不可用时才尝试 File.path 兜底
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
  const tauriOk = useRef(false);
  const htmlCnt = useRef(0);
  const tauriDrag = useRef(false);

  const processPaths = (paths: string[], from: "tauri" | "html") => {
    if (paths.length === 0) {
      if (from === "tauri") toast.error(t("drop.noPaths"));
      return;
    }
    const accepted = EXTS[acceptRef.current];
    const rejected: string[] = [];
    const ok: string[] = [];
    const seen = new Set<string>();
    for (const p of paths) {
      const key = p.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const ext = p.split(".").pop()?.toLowerCase() ?? "";
      if (!accepted.has(ext)) rejected.push(p.split(/[\\/]/).pop() ?? p);
      else ok.push(p);
    }
    if (rejected.length > 0) {
      toast.error(t(LABEL_KEYS[acceptRef.current], { names: rejected.join(", ") }));
    }
    if (ok.length > 0) onFilesRef.current(ok);
  };

  // Tauri 原生拖拽（路径唯一可靠来源）
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        unlisten = await getCurrentWebview().onDragDropEvent((e) => {
          if (disposed) return;
          const p = e.payload;
          if (p.type === "enter" || p.type === "over") {
            tauriDrag.current = true;
            setDragging(true);
          } else if (p.type === "drop") {
            tauriDrag.current = false;
            setDragging(false);
            processPaths(p.paths ?? [], "tauri");
          } else {
            tauriDrag.current = false;
            setDragging(false);
          }
        });
        tauriOk.current = true;
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

  // HTML5 辅助：高亮（不 preventDefault —— 会抑制 Tauri 事件）
  const htmlEnter = (e: DragEvent) => {
    if (tauriDrag.current) return; // Tauri 已接管
    e.preventDefault();
    htmlCnt.current++;
    setDragging(true);
  };
  const htmlOver = (e: DragEvent) => {
    if (tauriDrag.current) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  };
  const htmlLeave = (e: DragEvent) => {
    if (tauriDrag.current) return;
    e.preventDefault();
    htmlCnt.current = Math.max(0, htmlCnt.current - 1);
    if (htmlCnt.current === 0) setDragging(false);
  };
  const htmlDrop = (e: DragEvent) => {
    if (tauriDrag.current) return; // Tauri drop 已处理
    e.preventDefault();
    htmlCnt.current = 0;
    setDragging(false);
    // 兜底：仅当 Tauri 通道不可用时尝试 File.path（Chromium 安全策略下通常拿不到）
    if (!tauriOk.current) {
      const files = Array.from(e.dataTransfer?.files ?? []);
      const paths = files
        .map((f) => (f as unknown as { path?: string }).path)
        .filter((p): p is string => !!p);
      if (paths.length > 0) processPaths(paths, "html");
    }
  };

  return (
    <div
      className={cn("relative", className)}
      onDragEnter={htmlEnter}
      onDragOver={htmlOver}
      onDragLeave={htmlLeave}
      onDrop={htmlDrop}
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