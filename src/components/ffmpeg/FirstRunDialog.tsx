import { useCallback, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AlertTriangle, ExternalLink, FolderOpen } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useI18n } from "@/i18n";
import { useSettings } from "@/settings/SettingsProvider";
import { api } from "@/lib/tauri";
import type { FfmpegStatus } from "@/types";

/** Windows 官方推荐下载页（gyan.dev 构建） */
const FFMPEG_DOWNLOAD_URL = "https://www.gyan.dev/ffmpeg/builds/";

/**
 * 首次启动引导弹窗：
 * 仅当 (1) 首次启动（hasCompletedFirstRun=false）且 (2) FFmpeg 未检测到时自动弹出一次。
 * 三个出口：手动选择 ffmpeg.exe / 前往下载 / 稍后再说（记录完成，不再自动弹）。
 */
export function FirstRunDialog({
  show,
  onDone,
  onConfigured,
}: {
  show: boolean;
  /** 关闭弹窗（标记首次引导完成） */
  onDone: () => void;
  /** 用户已成功配置好 FFmpeg */
  onConfigured: (status: FfmpegStatus) => void;
}) {
  const { t } = useI18n();
  const { update } = useSettings();
  const [busy, setBusy] = useState(false);

  // 选择 ffmpeg.exe 时自动推导同目录 ffprobe.exe，一并写入设置并校验
  const pickFfmpeg = useCallback(async () => {
    try {
      const picked = await open({
        multiple: false,
        directory: false,
        title: t("settings.ffmpeg.browseFfmpeg"),
        filters: [{ name: "Executable", extensions: ["exe"] }],
      });
      if (typeof picked !== "string" || !picked) return;
      setBusy(true);
      // 推导 ffprobe.exe（与 ffmpeg.exe 同目录的兄弟文件）
      const dir = picked.replace(/[\\/][^\\/]+$/, "");
      const candidateProbe = dir + "\\ffprobe.exe";
      let ffprobePath: string | null = null;
      try {
        const s = await api.validateFfmpegPaths(picked, candidateProbe);
        if (s.ffmpeg && s.ffprobe) ffprobePath = candidateProbe;
      } catch {
        ffprobePath = null; // 校验失败不阻塞配置 ffmpeg
      }
      update({
        ffmpegPath: picked,
        ffprobePath,
        hasCompletedFirstRun: true,
      });
      const status = await api.detectFfmpeg();
      onConfigured(status);
    } catch (e) {
      console.error("选择 ffmpeg.exe 失败", e);
    } finally {
      setBusy(false);
    }
  }, [t, update, onConfigured]);

  return (
    <AlertDialog open={show} onOpenChange={(o) => !o && onDone()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-500" />
            {t("firstrun.title")}
          </AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line">
            {t("firstrun.desc")}
            <div className="mt-2 text-xs text-muted-foreground">
              {t("firstrun.laterHint")}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            variant="outline"
            onClick={(e) => {
              e.preventDefault();
              void openUrl(FFMPEG_DOWNLOAD_URL).catch(console.error);
            }}
          >
            <ExternalLink className="size-4" />
            {t("firstrun.download")}
          </AlertDialogAction>
          <AlertDialogAction
            variant="ghost"
            onClick={(e) => {
              e.preventDefault();
              onDone();
            }}
          >
            {t("firstrun.later")}
          </AlertDialogAction>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              void pickFfmpeg();
            }}
          >
            <FolderOpen className="size-4" />
            {t("firstrun.browse")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}