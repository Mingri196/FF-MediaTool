import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { RefreshCw, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { api } from "@/lib/tauri";
import { useI18n } from "@/i18n";
import { useSettings } from "@/settings/SettingsProvider";
import type { BinaryInfo, FfmpegStatus } from "@/types";

/** Windows 官方推荐下载页（gyan.dev 构建） */
const FFMPEG_DOWNLOAD_URL = "https://www.gyan.dev/ffmpeg/builds/";

function BinRow({
  label,
  info,
  invalid,
  onBrowse,
}: {
  label: string;
  info: BinaryInfo | null | undefined;
  invalid: boolean;
  onBrowse: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium">{label}</span>
          {info ? (
            <Badge variant={invalid ? "destructive" : "outline"}>
              {invalid ? t("settings.ffmpeg.invalidPath") : info.version}
            </Badge>
          ) : (
            <Badge variant="secondary">{t("settings.ffmpeg.notInstalled")}</Badge>
          )}
          {invalid && (
            <span className="text-xs text-destructive">
              {t("settings.ffmpeg.invalidPath")}
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
          {info ? info.path : t("settings.ffmpeg.noPath")}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {info && (
            <>
              {info.source === "manual"
                ? t("settings.ffmpeg.sourceManual")
                : t("settings.ffmpeg.sourcePath")}
            </>
          )}
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onBrowse}>
        {t("common.browse")}
      </Button>
    </div>
  );
}

/**
 * 设置页「FFmpeg 环境」卡片：
 * - 展示 ffmpeg / ffprobe 检测状态（路径来源、版本号）
 * - 手动指定路径（文件对话框）→ 自动校验
 * - 验证配置 / 重新检测 / 重置为系统 PATH / 前往下载
 */
export function FfmpegEnvCard() {
  const { t } = useI18n();
  const { settings, update } = useSettings();
  const [status, setStatus] = useState<FfmpegStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [validating, setValidating] = useState(false);
  const sessionRef = useRef(0);

  const detect = useCallback(async () => {
    if (!settings) return;
    const session = ++sessionRef.current;
    setChecking(true);
    try {
      const s = await api.detectFfmpeg();
      if (session !== sessionRef.current) return; // 过期响应丢弃
      setStatus(s);
      if (s.ffmpeg && s.ffprobe) {
        toast.success(t("settings.ffmpeg.validateSuccess"));
      } else if (s.manualInvalid) {
        toast.error(t("settings.ffmpeg.validateFail"));
      }
    } catch (e) {
      console.error(e);
      if (session === sessionRef.current) {
        toast.error(t("error.ffmpegDetectFailed"));
      }
    } finally {
      if (session === sessionRef.current) setChecking(false);
    }
  }, [settings, t]);

  // 设置变更（如重置路径）后自动重新检测
  useEffect(() => {
    void detect();
  }, [settings?.ffmpegPath, settings?.ffprobePath]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickBinary = useCallback(
    async (which: "ffmpeg" | "ffprobe") => {
      try {
        const picked = await open({
          multiple: false,
          directory: false,
          title: which === "ffmpeg" ? t("settings.ffmpeg.browseFfmpeg") : t("settings.ffmpeg.browseFfprobe"),
          filters: [{ name: "Executable", extensions: ["exe"] }],
        });
        if (typeof picked !== "string" || !picked) return;
        if (which === "ffmpeg") {
          update({ ffmpegPath: picked });
        } else {
          update({ ffprobePath: picked });
        }
      } catch (e) {
        console.error(e);
        toast.error(t("error.filePickFailed"));
      }
    },
    [t, update],
  );

  const validate = useCallback(async () => {
    if (!settings) return;
    setValidating(true);
    try {
      const s = await api.validateFfmpegPaths(settings.ffmpegPath, settings.ffprobePath);
      setStatus(s);
      if (s.ffmpeg && s.ffprobe) {
        toast.success(t("settings.ffmpeg.validateSuccess"));
      } else {
        toast.error(t("settings.ffmpeg.validateFail"));
      }
    } catch (e) {
      console.error(e);
      toast.error(t("error.ffmpegDetectFailed"));
    } finally {
      setValidating(false);
    }
  }, [settings, t]);

  const resetToPath = useCallback(() => {
    update({ ffmpegPath: null, ffprobePath: null });
  }, [update]);

  const openDownload = useCallback(() => {
    void openUrl(FFMPEG_DOWNLOAD_URL).catch((e) => {
      console.error(e);
      toast.error(t("error.ffmpegDetectFailed"));
    });
  }, [t]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("settings.ffmpeg.title")}
        </CardTitle>
        <CardDescription>{t("settings.ffmpeg.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col divide-y divide-border">
          <BinRow
            label="ffmpeg"
            info={status?.ffmpeg}
            invalid={checking ? false : !status?.ffmpeg && !!settings?.ffmpegPath}
            onBrowse={() => void pickBinary("ffmpeg")}
          />
          <BinRow
            label="ffprobe"
            info={status?.ffprobe}
            invalid={checking ? false : !status?.ffprobe && !!settings?.ffprobePath}
            onBrowse={() => void pickBinary("ffprobe")}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void validate()} disabled={validating || !settings}>
            {validating ? t("settings.ffmpeg.checking") : t("settings.ffmpeg.validate")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void detect()} disabled={checking}>
            <RefreshCw className={checking ? "size-3.5 animate-spin" : "size-3.5"} />
            {t("settings.ffmpeg.redetect")}
          </Button>
          <Button size="sm" variant="ghost" onClick={resetToPath}>
            {t("settings.ffmpeg.resetToPath")}
          </Button>
          <Button size="sm" variant="ghost" onClick={openDownload}>
            <ExternalLink className="size-3.5" />
            {t("settings.ffmpeg.download")}
          </Button>
        </div>

        <Separator />

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {status?.ffmpeg && status.ffprobe ? (
            <CheckCircle2 className="size-4 text-green-600" />
          ) : (
            <XCircle className="size-4 text-destructive" />
          )}
          <span>
            {status?.ffmpeg && status.ffprobe
              ? t("settings.ffmpeg.validateSuccess")
              : t("settings.ffmpeg.validateFail")}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}