import { type DragEvent, useRef, useState, type ReactNode } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

const SUPPORTED_EXTENSIONS = [
  "mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "ts", "m4v",
  "mp3", "flac", "wav", "ogg", "opus", "m4a", "aac", "wma", "aiff", "wv",
  "mpg", "mpeg", "3gp", "mts", "m2ts", "vob", "srt", "ass", "ssa", "vtt", "jpg", "jpeg", "png", "webp", "bmp",
];

const SUPPORTED_EXT_SET = new Set(SUPPORTED_EXTENSIONS);

export function DropZone({
  children,
  onFiles,
  className,
}: {
  children: ReactNode;
  onFiles: (paths: string[]) => void;
  className?: string;
}) {
  const { t } = useI18n();
  const [dragging, setDragging] = useState(false);
  const dragCount = useRef(0);

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCount.current++;
    setDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCount.current--;
    if (dragCount.current <= 0) {
      dragCount.current = 0;
      setDragging(false);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    dragCount.current = 0;

    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length === 0) return;

    const paths: string[] = [];
    const invalid: string[] = [];
    for (const f of files) {
      // Tauri webview exposes native path via f.path
      const path = (f as any).path as string | undefined;
      if (!path) {
        invalid.push(f.name);
        continue;
      }
      const ext = path.split(".").pop()?.toLowerCase() ?? "";
      if (!SUPPORTED_EXT_SET.has(ext)) {
        invalid.push(f.name);
        continue;
      }
      paths.push(path);
    }
    if (invalid.length > 0) {
      toast.error(t("drop.invalid", { names: invalid.join(", ") }));
    }
    if (paths.length > 0) {
      onFiles(paths);
    }
  };

  return (
    <div
      className={cn("relative", className)}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
      {/* 拖拽高亮遮罩 */}
      {dragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-primary/60 bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-primary">
            <Upload className="size-10 animate-bounce" />
            <span className="text-lg font-semibold">{t("drop.hint")}</span>
          </div>
        </div>
      )}
    </div>
  );
}