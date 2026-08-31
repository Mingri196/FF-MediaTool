import { useMemo, useState } from "react";
import { Pencil, Trash2, Video, AudioLines, ImageIcon, Scissors } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "@/i18n";
import { useSettings } from "@/settings/SettingsProvider";
import type { EncoderPreset } from "@/types";

/** 预设类型定义（与 EncoderPreset.category 对齐） */
const CATEGORIES = ["video", "audio", "image", "clip"] as const;
type PresetCategory = (typeof CATEGORIES)[number];

const CATEGORY_ICONS: Record<PresetCategory, typeof Video> = {
  video: Video,
  audio: AudioLines,
  image: ImageIcon,
  clip: Scissors,
};

const CATEGORY_KEYS: Record<PresetCategory, string> = {
  video: "settings.presets.categoryVideo",
  audio: "settings.presets.categoryAudio",
  image: "settings.presets.categoryImage",
  clip: "settings.presets.categoryClip",
};

/**
 * 编码预设模板管理（设置页）：
 * - 列表展示（名称 / 类型 / 创建时间）
 * - 重命名 / 删除（确认弹窗）
 * - 清除所有预设（二次确认弹窗，清空全部类型预设）
 * 数据存于 AppSettings.presets，持久化走后端 settings.json。
 */
export function PresetManagerCard() {
  const { t } = useI18n();
  const { settings, update } = useSettings();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EncoderPreset | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<PresetCategory>("video");
  const [deleting, setDeleting] = useState<EncoderPreset | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);

  const presets = useMemo(
    () => [...(settings?.presets ?? [])].sort((a, b) => b.createdAt - a.createdAt),
    [settings?.presets],
  );

  const openRename = (p: EncoderPreset) => {
    setEditing(p);
    setName(p.name);
    setCategory(p.category);
    setDialogOpen(true);
  };

  const submit = () => {
    if (!settings) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const now = Date.now();
    if (editing) {
      update({
        presets: settings.presets.map((p) =>
          p.id === editing.id
            ? { ...p, name: trimmed, category, updatedAt: now }
            : p,
        ),
      });
    } else {
      const preset: EncoderPreset = {
        id: crypto.randomUUID(),
        name: trimmed,
        category,
        createdAt: now,
        updatedAt: now,
        params: {},
      };
      update({ presets: [...settings.presets, preset] });
    }
    setDialogOpen(false);
  };

  const confirmDelete = () => {
    if (!settings || !deleting) return;
    update({
      presets: settings.presets.filter((p) => p.id !== deleting.id),
      recentPresets: settings.recentPresets.filter((id) => id !== deleting.id),
    });
    setDeleting(null);
  };

  /** 清除全部预设（四类全清；recentPresets 一并清空，不影响其它设置） */
  const confirmClearAll = () => {
    if (!settings) return;
    update({ presets: [], recentPresets: [] });
    setClearAllOpen(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{t("settings.presets.title")}</CardTitle>
            <CardDescription>{t("settings.presets.desc")}</CardDescription>
          </div>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setClearAllOpen(true)}
            disabled={presets.length === 0}
          >
            <Trash2 className="size-4" />
            {t("settings.presets.clearAll")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {presets.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            {t("settings.presets.empty")}
          </p>
        ) : (
          <ScrollArea className="max-h-64">
            <ul className="divide-y divide-border">
              {presets.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {p.name}
                      </span>
                      <Badge variant="secondary">
                        {t(CATEGORY_KEYS[p.category] as never, { defaultValue: p.category })}
                      </Badge>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {t("settings.presets.createdAt", {
                        date: new Date(p.createdAt).toLocaleString(),
                      })}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      title={t("settings.presets.rename")}
                      onClick={() => openRename(p)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive hover:text-destructive"
                      title={t("settings.presets.delete")}
                      onClick={() => setDeleting(p)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
        <Separator className="my-4" />
        <p className="text-xs text-muted-foreground">
          {t("settings.presets.noParamsHint")}
        </p>
      </CardContent>

      {/* 新建 / 重命名对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editing ? t("settings.presets.rename") : t("settings.presets.new")}
            </DialogTitle>
            <DialogDescription />
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("settings.presets.nameLabel")}</Label>
              <Input
                value={name}
                placeholder={t("settings.presets.namePlaceholder")}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("settings.presets.categoryLabel")}</Label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => {
                  const Icon = CATEGORY_ICONS[c];
                  return (
                    <Button
                      key={c}
                      type="button"
                      variant={category === c ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCategory(c)}
                    >
                      <Icon className="size-3.5" />
                      {t(CATEGORY_KEYS[c] as never)}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={submit} disabled={!name.trim()}>
              {editing ? t("common.save") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.presets.delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.presets.deleteConfirm", { name: deleting?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 清除所有预设确认对话框 */}
      <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.presets.clearAll")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.presets.clearAllConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setClearAllOpen(false)}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmClearAll}>
              {t("settings.presets.clearAllAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}