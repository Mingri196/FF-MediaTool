import { Check, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useI18n } from "@/i18n";
import { useSettings } from "@/settings/SettingsProvider";
import { api } from "@/lib/tauri";
import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
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
  const [localPaths, setLocalPaths] = useState(settings?.outputPaths ?? {});
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

        {/* 默认输出路径 */}
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.outputPath.title")}</CardTitle>
            <CardDescription>{t("settings.outputPath.desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
              <span className="text-sm text-muted-foreground">{t("settings.outputPath.globalDir")}</span>
              <span className="font-mono text-xs">App Root/opt</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => void api.openOptDir()}>
              <FolderOpen className="size-4" />{t("settings.outputPath.openDir")}
            </Button>
            <Collapsible>
              <CollapsibleTrigger className="flex w-full items-center gap-2 text-left">
                  <Button variant="secondary" size="sm" className="w-full">
                    {t("settings.outputPath.customToggle")}
                  </Button>
                </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("settings.outputPath.videoConvert")}</Label>
                    <Input value={localPaths.videoConvert ?? ""} onChange={(e) => setLocalPaths({ ...localPaths, videoConvert: e.target.value || null })} />
                    <Button variant="outline" size="icon" className="size-6" onClick={async () => { const d = await open({ directory: true, title: t("settings.outputPath.videoConvert") }); if (typeof d === "string") setLocalPaths({ ...localPaths, videoConvert: d }); }}><FolderOpen className="size-3" /></Button>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("settings.outputPath.audioConvert")}</Label>
                    <Input value={localPaths.audioConvert ?? ""} onChange={(e) => setLocalPaths({ ...localPaths, audioConvert: e.target.value || null })} />
                    <Button variant="outline" size="icon" className="size-6" onClick={async () => { const d = await open({ directory: true, title: t("settings.outputPath.audioConvert") }); if (typeof d === "string") setLocalPaths({ ...localPaths, audioConvert: d }); }}><FolderOpen className="size-3" /></Button>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("settings.outputPath.imageConvert")}</Label>
                    <Input value={localPaths.imageConvert ?? ""} onChange={(e) => setLocalPaths({ ...localPaths, imageConvert: e.target.value || null })} />
                    <Button variant="outline" size="icon" className="size-6" onClick={async () => { const d = await open({ directory: true, title: t("settings.outputPath.imageConvert") }); if (typeof d === "string") setLocalPaths({ ...localPaths, imageConvert: d }); }}><FolderOpen className="size-3" /></Button>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("settings.outputPath.videoClip")}</Label>
                    <Input value={localPaths.videoClip ?? ""} onChange={(e) => setLocalPaths({ ...localPaths, videoClip: e.target.value || null })} />
                    <Button variant="outline" size="icon" className="size-6" onClick={async () => { const d = await open({ directory: true, title: t("settings.outputPath.videoClip") }); if (typeof d === "string") setLocalPaths({ ...localPaths, videoClip: d }); }}><FolderOpen className="size-3" /></Button>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setLocalPaths({ ...settings.outputPaths }); }}>{t("settings.outputPath.cancel")}</Button>
                  <Button size="sm" onClick={() => { update({ outputPaths: localPaths }); }}>{t("settings.outputPath.save")}</Button>
                </div>
              </CollapsibleContent>
            </Collapsible>
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
          <span>FF-MediaTool v0.40</span>
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