import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ImagePlus, LibraryBig, FolderOpen, Film } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useI18n } from "@/i18n";
import { useSettings } from "@/settings/SettingsProvider";
import { api } from "@/lib/tauri";
import { BackgroundLibraryDialog } from "./BackgroundLibraryDialog";

const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp"];
const VIDEO_EXTS = ["mp4", "webm"];
const ALL_EXTS = [...IMAGE_EXTS, ...VIDEO_EXTS];

function isVideoFile(name: string | null): boolean {
  if (!name) return false;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTS.includes(ext);
}

/**
 * 设置-外观：自定义背景卡片（总开关 / 选择背景文件 / 自定义图库 / 透明度 / 视频速度）。
 * 放在「主题模式」与「强调色」两者中间。
 */
export function CustomBackgroundCard() {
  const { t } = useI18n();
  const { settings, update } = useSettings();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  const enabled = settings?.backgroundEnabled ?? false;
  const file = settings?.backgroundFile ?? null;
  const opacity = settings?.backgroundOpacity ?? 100;
  const panelOpacity = settings?.panelOpacity ?? 100;
  const chromeOpacity = settings?.chromeOpacity ?? 100;
  const speed = settings?.backgroundVideoSpeed ?? 1;

  const pickAndImport = async () => {
    try {
      const picked = await open({
        multiple: false,
        filters: [{ name: "Background", extensions: ALL_EXTS }],
      });
      if (typeof picked !== "string" || !picked) return;
      setImporting(true);
      // 复制到 Background 目录，返回内部文件名（不保存外部路径）
      const name = await api.backgroundImport(picked);
      update({ backgroundFile: name, backgroundEnabled: true });
      toast.success(t("settings.appearance.bgImportOk"));
    } catch {
      toast.error(t("settings.appearance.bgImportErr"));
    } finally {
      setImporting(false);
    }
  };

  const currentIsVideo = isVideoFile(file);

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-sm font-medium">
            <ImagePlus className="size-4 text-primary" />
            {t("settings.appearance.bgLabel")}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("settings.appearance.bgDesc")}
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(c) => update({ backgroundEnabled: !!c })}
        />
      </div>

      {/* 当前背景 */}
      <div className="flex items-center gap-2 text-sm">
        <span className="shrink-0 text-muted-foreground">
          {t("settings.appearance.bgCurrent")}:
        </span>
        <span className="truncate font-mono text-xs">
          {file ?? t("settings.appearance.bgNone")}
        </span>
      </div>

      {/* 选择文件 / 图库 */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={importing}
          onClick={() => void pickAndImport()}
        >
          <FolderOpen className="size-4" />
          {t("settings.appearance.bgSelect")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setLibraryOpen(true)}
        >
          <LibraryBig className="size-4" />
          {t("settings.appearance.bgLibrary")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("settings.appearance.bgSelectHint")}
      </p>

      {/* 面板效果：模糊（默认）/ 透明（仅开启背景时生效） */}
      <div className="space-y-1.5">
        <span className="font-medium text-muted-foreground text-xs">
          {t("settings.appearance.bgPanelEffect")}
        </span>
        <div
          role="radiogroup"
          className="flex w-fit items-center gap-1 rounded-lg border border-border bg-muted/50 p-1"
        >
          <button
            type="button"
            role="radio"
            aria-checked={(settings?.panelEffect ?? "blur") === "blur"}
            data-panel-effect-option="blur"
            onClick={() => update({ panelEffect: "blur" })}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              (settings?.panelEffect ?? "blur") === "blur"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("settings.appearance.bgPanelEffectBlur")}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={(settings?.panelEffect ?? "blur") === "transparent"}
            data-panel-effect-option="transparent"
            onClick={() => update({ panelEffect: "transparent" })}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              (settings?.panelEffect ?? "blur") === "transparent"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("settings.appearance.bgPanelEffectTransparent")}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t("settings.appearance.bgPanelEffectHint")}
        </p>
      </div>

      {/* 透明度 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-muted-foreground">
            {t("settings.appearance.bgOpacity")}
          </span>
          <span className="font-mono">{opacity}%</span>
        </div>
        <Slider
          min={0}
          max={100}
          step={1}
          value={opacity}
          onValueChange={(v) => {
            const n = Array.isArray(v) ? v[0] : v;
            if (n !== undefined) update({ backgroundOpacity: Math.round(n) });
          }}
        />
        <p className="text-[11px] text-muted-foreground">
          {t("settings.appearance.bgOpacityHint")}
        </p>
      </div>

      {/* 板块透明度（控制各功能页卡片容器背景；默认 100 不透明） */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-muted-foreground">
            {t("settings.appearance.bgPanelOpacity")}
          </span>
          <span className="font-mono">{panelOpacity}%</span>
        </div>
        <Slider
          min={0}
          max={100}
          step={1}
          value={panelOpacity}
          onValueChange={(v) => {
            const n = Array.isArray(v) ? v[0] : v;
            if (n !== undefined) update({ panelOpacity: Math.round(n) });
          }}
        />
        <p className="text-[11px] text-muted-foreground">
          {t("settings.appearance.bgPanelOpacityHint")}
        </p>
      </div>

      {/* 侧边栏与运行日志透明度（独立参数，默认 100 不透明） */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-muted-foreground">
            {t("settings.appearance.bgChromeOpacity")}
          </span>
          <span className="font-mono">{chromeOpacity}%</span>
        </div>
        <Slider
          min={0}
          max={100}
          step={1}
          value={chromeOpacity}
          onValueChange={(v) => {
            const n = Array.isArray(v) ? v[0] : v;
            if (n !== undefined) update({ chromeOpacity: Math.round(n) });
          }}
        />
        <p className="text-[11px] text-muted-foreground">
          {t("settings.appearance.bgChromeOpacityHint")}
        </p>
      </div>

      {/* 视频速度（仅视频背景可用） */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1 font-medium text-muted-foreground">
            <Film className="size-3.5" />
            {t("settings.appearance.bgSpeed")}
          </span>
          <span className="font-mono">{speed.toFixed(1)}x</span>
        </div>
        <Slider
          min={0.5}
          max={2}
          step={0.1}
          value={speed}
          disabled={!currentIsVideo || !enabled}
          onValueChange={(v) => {
            const n = Array.isArray(v) ? v[0] : v;
            if (n !== undefined) update({ backgroundVideoSpeed: n });
          }}
        />
        <p className="text-[11px] text-muted-foreground">
          {t("settings.appearance.bgSpeedHint")}
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        {t("settings.appearance.bgShortcutHint")}
      </p>

      <BackgroundLibraryDialog
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
      />
    </div>
  );
}