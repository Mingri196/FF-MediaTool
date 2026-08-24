import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, Video, AudioLines } from "lucide-react";
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

/**
 * 编码预设模板管理（设置页）：
 * - 列表展示（名称 / 类型 / 创建时间）
 * - 新建（模块一先建空模板占位；模块三/四转换页会把当前参数写入 params）
 * - 重命名 / 删除（确认弹窗）
 * 数据存于 AppSettings.presets，持久化走后端 settings.json。
 */
export function PresetManagerCard() {
  const { t } = useI18n();
  const { settings, update } = useSettings();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EncoderPreset | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"video" | "audio">("video");
  const [deleting, setDeleting] = useState<EncoderPreset | null>(null);

  const presets = useMemo(
    () => [...(settings?.presets ?? [])].sort((a, b) => b.createdAt - a.createdAt),
    [settings?.presets],
  );

  const openCreate = () => {
    setEditing(null);
    setName("");
    setCategory("video");
    setDialogOpen(true);
  };

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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{t("settings.presets.title")}</CardTitle>
            <CardDescription>{t("settings.presets.desc")}</CardDescription>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" />
            {t("settings.presets.new")}
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
                        {p.category === "video"
                          ? t("settings.presets.categoryVideo")
                          : t("settings.presets.categoryAudio")}
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
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={category === "video" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCategory("video")}
                >
                  <Video className="size-3.5" />
                  {t("settings.presets.categoryVideo")}
                </Button>
                <Button
                  type="button"
                  variant={category === "audio" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCategory("audio")}
                >
                  <AudioLines className="size-3.5" />
                  {t("settings.presets.categoryAudio")}
                </Button>
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
    </Card>
  );
}