import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "@/i18n";
import { useSettings } from "@/settings/SettingsProvider";
import {
  ACCENT_PRESETS,
} from "@/theme/theme";
import { FfmpegEnvCard } from "@/components/ffmpeg/FfmpegEnvCard";
import { PresetManagerCard } from "@/components/presets/PresetManagerCard";
import type { Language, ThemeMode } from "@/types";

const THEME_OPTIONS: { value: ThemeMode; labelKey: "settings.appearance.theme.light" | "settings.appearance.theme.dark" | "settings.appearance.theme.system" }[] = [
  { value: "light", labelKey: "settings.appearance.theme.light" },
  { value: "dark", labelKey: "settings.appearance.theme.dark" },
  { value: "system", labelKey: "settings.appearance.theme.system" },
];

/** 设置页：模块一全部设置项的汇总页 */
export function SettingsPage() {
  const { t } = useI18n();
  const { settings, update } = useSettings();
  if (!settings) return null;

  const setLang = (lang: Language) => update({ language: lang });
  const setTheme = (theme: ThemeMode) => update({ theme });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 p-6">
        <div>
          <h1 className="text-xl font-semibold">{t("settings.title")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("settings.desc")}</p>
        </div>

        {/* 语言 */}
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.language.title")}</CardTitle>
            <CardDescription>{t("settings.language.desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={settings.language} onValueChange={(v) => setLang(v as Language)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zh">{t("settings.language.zh")}</SelectItem>
                <SelectItem value="en">{t("settings.language.en")}</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* 外观 */}
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.appearance.title")}</CardTitle>
            <CardDescription>{t("settings.appearance.desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* 主题模式 */}
            <div>
              <div className="mb-2 text-sm font-medium">
                {t("settings.appearance.themeLabel")}
              </div>
              <div className="flex gap-2">
                {THEME_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    variant={settings.theme === opt.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTheme(opt.value)}
                  >
                    {t(opt.labelKey)}
                  </Button>
                ))}
              </div>
            </div>
            <Separator />
            {/* 强调色 */}
            <div>
              <div className="mb-2 text-sm font-medium">
                {t("settings.appearance.accentLabel")}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {ACCENT_PRESETS.map((a) => {
                  const active = settings.accentColor.toLowerCase() === a.color.toLowerCase();
                  return (
                    <button
                      key={a.color}
                      type="button"
                      title={a.name}
                      onClick={() => update({ accentColor: a.color })}
                      className={cn(
                        "relative flex size-8 items-center justify-center rounded-full border-2 transition-transform hover:scale-105",
                        active ? "border-foreground" : "border-transparent",
                      )}
                      style={{ backgroundColor: a.color }}
                    >
                      {active && (
                        <Check className="size-4 text-white drop-shadow" />
                      )}
                    </button>
                  );
                })}
                <label
                  className="relative flex size-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-muted-foreground/60 transition-transform hover:scale-105"
                  title={t("settings.appearance.accentLabel")}
                >
                  <input
                    type="color"
                    value={settings.accentColor}
                    onChange={(e) => update({ accentColor: e.target.value })}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                  <span className="text-[10px] text-muted-foreground">+</span>
                </label>
              </div>
              <div className="mt-1.5 font-mono text-xs text-muted-foreground">
                {settings.accentColor.toUpperCase()}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 使用习惯记忆 */}
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.habits.title")}</CardTitle>
            <CardDescription>{t("settings.habits.desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <Row k={t("settings.habits.window")} v={t("settings.habits.windowVal")} />
            <Row
              k={t("settings.habits.lastOutputDir")}
              v={settings.lastOutputDir ?? t("settings.habits.empty")}
              mono
            />
            <Row
              k={t("settings.habits.recentPresets")}
              v={
                settings.recentPresets.length > 0
                  ? String(settings.recentPresets.length)
                  : t("settings.habits.empty")
              }
            />
          </CardContent>
        </Card>

        {/* FFmpeg 环境 */}
        <FfmpegEnvCard />

        {/* 编码预设模板 */}
        <PresetManagerCard />

        {/* 页脚版本信息 */}
        <div className="flex items-center justify-between pb-4 pt-1 text-xs text-muted-foreground">
          <span>FF-MediaTool v0.24</span>
          <Badge variant="outline">Tauri 2 + React + Rust</Badge>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{k}</span>
      <span
        className={cn(
          "min-w-0 truncate text-right",
          mono && "font-mono text-xs leading-5",
        )}
      >
        {v}
      </span>
    </div>
  );
}