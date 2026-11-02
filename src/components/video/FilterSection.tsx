import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ScanSearch, Trash2, ImagePlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { api } from "@/lib/tauri";
import type { CropBox, FlipMode, RotateMode, VideoParams } from "@/video/types";
import { FileRow } from "@/components/shared/FileRow";

/**
 * 滤镜与增强（PRD 3.4）：
 * 基础滤镜（裁剪/去黑边/旋转/翻转/水印/字幕）+ 画质（降噪/锐化/色彩）。
 * 流复制（copy）模式下整体灰化禁用，避免无效参数报错。
 */
export function FilterSection({
  video,
  inputPath,
  onChange,
  disabled,
}: {
  video: VideoParams;
  /** 输入文件路径（去黑边检测需要） */
  inputPath: string;
  onChange: (v: VideoParams) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [detecting, setDetecting] = useState(false);
  const dis = disabled || video.vcodec === "copy";
  const set = (patch: Partial<VideoParams>) => onChange({ ...video, ...patch });

  const runCropDetect = async () => {
    if (!inputPath) return;
    setDetecting(true);
    try {
      const crop = await api.detectCrop(inputPath);
      set({ cropDetected: crop, crop: null });
      toast.success(t("filter.cropDetectDone", { w: crop.w, h: crop.h, x: crop.x, y: crop.y }));
    } catch (e) {
      console.error(e);
      toast.error(t("filter.cropDetectFail"));
    } finally {
      setDetecting(false);
    }
  };

  const pickWatermark = async () => {
    const picked = await open({
      multiple: false,
      directory: false,
      title: t("filter.watermarkImage"),
      filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "bmp"] }],
    });
    if (typeof picked === "string" && picked) {
      set({
        watermark: {
          image: picked,
          x: "10",
          y: "10",
          w: 0,
          opacity: 1,
        },
      });
    }
  };

  const pickSubtitle = async () => {
    const picked = await open({
      multiple: false,
      directory: false,
      title: t("filter.subtitleFile"),
      filters: [{ name: "Subtitles", extensions: ["srt", "ass", "ssa", "vtt"] }],
    });
    if (typeof picked === "string" && picked) {
      set({ subtitles: { file: picked } });
    }
  };

  return (
    <div className={cn("space-y-4", dis && "pointer-events-none opacity-50")}>
      <p className="text-sm text-muted-foreground">{t("codec.copyHint")}</p>

      {/* 画面裁剪 + 去黑边 */}
      <div className="rounded-md border border-border p-3">
        <div className="flex items-center gap-2 pb-2">
          <Checkbox
            id="crop-enable"
            checked={!!(video.cropDetected ?? video.crop)}
            onCheckedChange={(c) =>
              set(c ? { crop: video.crop ?? { w: 640, h: 360, x: 0, y: 0 }, cropDetected: null } : { crop: null, cropDetected: null })
            }
          />
          <Label htmlFor="crop-enable" className="cursor-pointer">{t("filter.crop")}</Label>
          {(video.cropDetected ?? video.crop) && (
            <Badge variant="outline" className="font-mono">
              {video.cropDetected
                ? `${video.cropDetected.w}x${video.cropDetected.h}+${video.cropDetected.x}+${video.cropDetected.y}`
                : `${video.crop?.w}x${video.crop?.h}+${video.crop?.x}+${video.crop?.y}`}
            </Badge>
          )}
          <div className="ml-auto flex gap-1">
            <Button size="sm" variant="outline" onClick={() => void runCropDetect()} disabled={dis || detecting}>
              <ScanSearch className={cn("size-3.5", detecting && "animate-pulse")} />
              {t("filter.cropDetectRun")}
            </Button>
            {(video.cropDetected ?? video.crop) && (
              <Button size="sm" variant="ghost" onClick={() => set({ crop: null, cropDetected: null })}>
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
        {(video.cropDetected ?? video.crop) ? (
          <div className="grid grid-cols-4 gap-2">
            {(["w", "h", "x", "y"] as const).map((k) => {
              const crop = (video.cropDetected ?? video.crop)!;
              return (
                <div key={k} className="space-y-1">
                  <Label className="text-xs">{t(`filter.crop${k.toUpperCase()}` as never)}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={crop[k]}
                    onChange={(e) => {
                      const n = Math.max(0, Number(e.target.value) || 0);
                      const patch = { ...crop, [k]: n } as CropBox;
                      set({ crop: video.crop ? patch : null, cropDetected: video.cropDetected ? patch : null });
                    }}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("filter.cropDetect")} — {t("filter.cropDetectRun")}
          </p>
        )}
      </div>

      {/* 旋转 / 翻转 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>{t("filter.rotate")}</Label>
          <Select
            value={video.rotate}
            onValueChange={(v) => set({ rotate: v as RotateMode })}
            items={{
              none: t("filter.rotate.none"), "90": t("filter.rotate.90"),
              "180": t("filter.rotate.180"), "270": t("filter.rotate.270"), custom: t("filter.rotate.custom"),
            }}
          >
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("filter.rotate.none")}</SelectItem>
              <SelectItem value="90">{t("filter.rotate.90")}</SelectItem>
              <SelectItem value="180">{t("filter.rotate.180")}</SelectItem>
              <SelectItem value="270">{t("filter.rotate.270")}</SelectItem>
              <SelectItem value="custom">{t("filter.rotate.custom")}</SelectItem>
            </SelectContent>
          </Select>
          {video.rotate === "custom" && (
            <Input
              type="number"
              min={-360}
              max={360}
              value={video.rotateDeg}
              onChange={(e) => set({ rotateDeg: Number(e.target.value) || 0 })}
            />
          )}
        </div>
        <div className="space-y-1.5">
          <Label>{t("filter.flip")}</Label>
          <Select
            value={video.flip}
            onValueChange={(v) => set({ flip: v as FlipMode })}
            items={{ none: t("filter.flip.none"), h: t("filter.flip.h"), v: t("filter.flip.v") }}
          >
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("filter.flip.none")}</SelectItem>
              <SelectItem value="h">{t("filter.flip.h")}</SelectItem>
              <SelectItem value="v">{t("filter.flip.v")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 水印 */}
      <div className="rounded-md border border-border p-3">
        <div className="flex items-center gap-2 pb-2">
          <Checkbox
            id="wmk-enable"
            checked={!!video.watermark}
            onCheckedChange={(c) => set(c ? { watermark: { image: "", x: "10", y: "10", w: 0, opacity: 1 } } : { watermark: null })}
          />
          <Label htmlFor="wmk-enable" className="cursor-pointer">{t("filter.watermark")}</Label>
          {video.watermark && (
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => void pickWatermark()}>
              <ImagePlus className="size-3.5" />
              {video.watermark.image ? video.watermark.image.split(/[\\/]/).pop() : t("filter.watermarkImage")}
            </Button>
          )}
        </div>
        {video.watermark && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t("filter.watermarkX")}</Label>
              <Input
                value={video.watermark.x}
                onChange={(e) => set({ watermark: { ...video.watermark!, x: e.target.value } })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("filter.watermarkY")}</Label>
              <Input
                value={video.watermark.y}
                onChange={(e) => set({ watermark: { ...video.watermark!, y: e.target.value } })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("filter.watermarkW")}</Label>
              <Input
                type="number"
                min={0}
                value={video.watermark.w || ""}
                placeholder={t("common.auto")}
                onChange={(e) => set({ watermark: { ...video.watermark!, w: Math.max(0, Number(e.target.value) || 0) } })}
              />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <Label className="text-xs">{t("filter.watermarkOpacity")}</Label>
                <span className="text-xs text-muted-foreground">
                  {Math.round(video.watermark.opacity * 100)}%
                </span>
              </div>
              <Slider
                min={0.05}
                max={1}
                step={0.05}
                value={[video.watermark.opacity]}
                onValueChange={(value) => {
                  const v = Array.isArray(value) ? value[0] : value;
                  if (v !== undefined) set({ watermark: { ...video.watermark!, opacity: v } });
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 字幕烧录 */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Checkbox
            id="sub-enable"
            checked={!!video.subtitles}
            onCheckedChange={(c) => set(c ? { subtitles: { file: "" } } : { subtitles: null })}
          />
          <Label htmlFor="sub-enable" className="cursor-pointer">{t("filter.subtitles")}</Label>
        </div>
        {video.subtitles && (
          <FileRow
            label=""
            value={video.subtitles.file}
            placeholder={t("filter.subtitleFile")}
            onBrowse={() => void pickSubtitle()}
            browseTitle={t("filter.subtitleFile")}
          />
        )}
      </div>

      {/* 降噪 / 锐化 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="denoise"
            checked={video.denoise}
            onCheckedChange={(c) => set({ denoise: !!c })}
          />
          <Label htmlFor="denoise" className="cursor-pointer">{t("filter.denoise")}</Label>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="cursor-default">{t("filter.sharpen")}</Label>
            <span className="text-xs text-muted-foreground">
              {video.sharpen > 0 ? video.sharpen.toFixed(1) : t("common.off")}
            </span>
          </div>
          <Slider
            min={0}
            max={5}
            step={0.1}
            value={[video.sharpen]}
            onValueChange={(value) => {
              const v = Array.isArray(value) ? value[0] : value;
              if (v !== undefined) set({ sharpen: v });
            }}
          />
        </div>
      </div>

      {/* 色彩 */}
      <div className="space-y-3 rounded-md border border-border p-3">
        <Label>{t("filter.color")}</Label>
        <ColorRow label={t("filter.brightness")} value={video.brightness} min={-1} max={1} step={0.05}
          onChange={(v) => set({ brightness: v })} />
        <ColorRow label={t("filter.contrast")} value={video.contrast} min={0} max={2} step={0.05}
          onChange={(v) => set({ contrast: v })} />
        <ColorRow label={t("filter.saturation")} value={video.saturation} min={0} max={3} step={0.05}
          onChange={(v) => set({ saturation: v })} />
      </div>
    </div>
  );
}

function ColorRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-xs">{label}</span>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => {
          const n = Array.isArray(v) ? v[0] : v;
          if (n !== undefined) onChange(n);
        }}
        className="flex-1"
      />
      <span className="w-12 shrink-0 text-right font-mono text-xs text-muted-foreground">
        {value.toFixed(2)}
      </span>
    </div>
  );
}