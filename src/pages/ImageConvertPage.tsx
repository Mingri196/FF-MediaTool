import { useCallback, useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ImagePlus, FolderOpen, Trash2, Play, RotateCw, FlipHorizontal, FlipVertical, Crop, Palette, Expand } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropZone } from "@/components/shared/DropZone";
import { useI18n } from "@/i18n";
import { useTasks } from "@/tasks/TaskProvider";
import { useSettings } from "@/settings/SettingsProvider";
import { api } from "@/lib/tauri";
import { buildImageArgs, genOutputPath } from "@/image/builder";
import { defaultImageParams, IMAGE_OUTPUT_FORMATS, type ImageFileItem, type ImageParams } from "@/image/types";
import { INPUT_IMAGE_EXTS, getPreset, applyFormatDefaults } from "@/image/formatPresets";
import { basename } from "@/lib/format";
import { invoke } from "@/lib/tauri";

const RESIZE_MODES = ["none", "percent", "fitWidth", "fitHeight", "fixed", "custom", "fill", "contain", "cover"] as const;
const ADAPT_MODES = ["none", "fill", "contain", "cover"] as const;
const ASPECT_RATIOS = ["free", "1:1", "16:9", "4:3", "3:2", "21:9"];

/** 各调整模式的中英文提示说明 */
const RESIZE_TOOLTIPS: Record<string, string> = {
  none: "img.tip.none",
  percent: "img.tip.percent",
  fitWidth: "img.tip.fitWidth",
  fitHeight: "img.tip.fitHeight",
  custom: "img.tip.custom",
  fixed: "img.tip.fixed",
  fill: "img.tip.fill",
  contain: "img.tip.contain",
  cover: "img.tip.cover",
  adaptNone: "img.tip.adaptNone",
  dpi: "img.tip.dpi",
};

export function ImageConvertPage() {
  const { t } = useI18n();
  const { guardAddTask } = useTasks();
  const { settings } = useSettings();
  const [files, setFiles] = useState<ImageFileItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [params, setParams] = useState<ImageParams>(defaultImageParams());
  const [processing, setProcessing] = useState(false);

  const allSelected = files.length > 0 && selected.size === files.length;
  const selectedCount = selected.size;
  const firstSelectedFile = selectedCount === 1 ? files[[...selected][0]] : null;

  const addFiles = useCallback(async (paths?: string[]) => {
    if (!paths) {
      const picked = await open({ multiple: true, filters: [{ name: "Images", extensions: INPUT_IMAGE_EXTS }], title: t("img.addFiles") });
      if (typeof picked === "string") paths = [picked];
      else if (Array.isArray(picked)) paths = picked;
      else return;
    }
    const existingPaths = new Set(files.map((f) => f.path));
    const newItems: ImageFileItem[] = paths.filter((p) => {
      const ext = p.split(".").pop()?.toLowerCase() ?? "";
      return INPUT_IMAGE_EXTS.includes(ext) && !existingPaths.has(p);
    }).map((p) => {
      const name = p.split(/[\\/]/).pop() ?? "";
      return { path: p, name, size: 0, ext: p.split(".").pop()?.toLowerCase() ?? "" };
    });
    if (newItems.length > 0) {
      setFiles((prev) => [...prev, ...newItems]);
      setSelected((prev) => {
        const next = new Set(prev);
        for (let i = files.length; i < files.length + newItems.length; i++) next.add(i);
        return next;
      });
    }
  }, [files, t]);

  const addFolder = useCallback(async () => {
    const dir = await open({ directory: true, multiple: false, title: t("img.addFolder") });
    if (!dir || typeof dir !== "string") return;
    try {
      const paths: string[] = await invoke("scan_directory", { path: dir });
      if (paths.length === 0) {
        const { toast } = await import("sonner");
        toast.error(t("img.folderEmpty"));
        return;
      }
      const existingPaths = new Set(files.map((f) => f.path));
      const newItems: ImageFileItem[] = paths.filter((p) => !existingPaths.has(p)).map((p) => {
        const name = p.split(/[\\/]/).pop() ?? "";
        return { path: p, name, size: 0, ext: p.split(".").pop()?.toLowerCase() ?? "" };
      });
      if (newItems.length > 0) {
        setFiles((prev) => [...prev, ...newItems]);
        setSelected((prev) => {
          const next = new Set(prev);
          for (let i = files.length; i < files.length + newItems.length; i++) next.add(i);
          return next;
        });
      }
    } catch {
      const { toast } = await import("sonner");
      toast.error(t("img.folderEmpty"));
    }
  }, [files, t]);

  const toggleSelect = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(files.map((_, i) => i)));
  };

  const removeSelected = () => {
    setFiles((prev) => prev.filter((_, i) => !selected.has(i)));
    setSelected(new Set());
  };
  const clearFiles = () => { setFiles([]); setSelected(new Set()); };

  // 输出目录从设置同步；空路径回落 opt
  useEffect(() => {
    (async () => {
      const imgPath = settings?.outputPaths?.imageConvert || (await api.getOptDir());
      if (imgPath) setParams((p) => ({ ...p, outputDir: imgPath }));
    })();
  }, [settings?.outputPaths?.imageConvert]);

  // 单张选中时自动填充宽高，多图/无图时清空
  useEffect(() => {
    if (firstSelectedFile) {
      // 在 builder 中可通过 ffprobe 获取实际尺寸，此处用占位符
      // 实际尺寸由用户手动输入，或留空自动
    } else if (selectedCount !== 1) {
      setParams((p) => ({ ...p, resize: { ...p.resize, value: 0, value2: 0 } }));
    }
  }, [firstSelectedFile, selectedCount]);

  const formatPreset = useMemo(() => getPreset(params.format), [params.format]);
  const isLossless = params.lossless;

  const changeFormat = (fmt: string) => {
    setParams(applyFormatDefaults(params, fmt as ImageParams["format"]));
  };

  const startBatch = () => {
    if (selectedCount === 0) return;
    setProcessing(true);
    const selectedFiles = files.filter((_, i) => selected.has(i));
    for (let i = 0; i < selectedFiles.length; i++) {
      const f = selectedFiles[i];
      const out = genOutputPath(f.path, params.format, i, params.namingPrefix, params.namingSuffix, params.namingSeq, params.outputDir);
      const args = buildImageArgs(params, f.path, out);
      guardAddTask({
        name: `${basename(f.path)} → ${basename(out)}`,
        args,
        inputPath: f.path,
        outputPath: out,
      });
    }
    setProcessing(false);
  };

  const sliderVal = (v: number | readonly number[]) => (Array.isArray(v) ? v[0] ?? 0 : v);
  const disabled = isLossless;

  const T = (tipKey: string, children: React.ReactNode) => (
    <TooltipProvider delay={300}>
      <Tooltip>
        <TooltipTrigger>{children}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-64 text-xs">{t(tipKey as any)}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <DropZone onFiles={(paths) => void addFiles(paths)} accept="all" className="h-full">
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-5 p-6">
          <div>
            <h1 className="text-xl font-semibold">{t("img.title")}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("img.desc")}</p>
          </div>

          {/* 文件列表（含勾选） */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                  <CardTitle className="text-base">{t("img.fileList")}</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t("img.fileCount", { count: files.length })} / {t("img.selectedCount", { count: selectedCount })}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => void addFolder()}><FolderOpen className="size-4" />{t("img.addFolder")}</Button>
                  <Button variant="outline" size="sm" onClick={() => void addFiles()}><ImagePlus className="size-4" />{t("img.addFiles")}</Button>
                  {selectedCount > 0 && <Button variant="ghost" size="sm" onClick={removeSelected}><Trash2 className="size-4" />{t("img.removeSelected")}</Button>}
                  {files.length > 0 && <Button variant="ghost" size="sm" onClick={clearFiles}><Trash2 className="size-4" />{t("img.clearAll")}</Button>}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {files.length === 0 && (
                <div className="flex h-20 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">{t("img.noFiles")}</div>
              )}
              {files.map((f, i) => (
                <div key={f.path} className="flex items-center gap-3 rounded-md bg-muted/30 px-3 py-2 text-sm">
                  <Checkbox checked={selected.has(i)} onCheckedChange={() => toggleSelect(i)} />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{f.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">.{f.ext}</span>
                  <Button variant="ghost" size="icon" className="size-6 text-muted-foreground" onClick={() => {
                    setFiles((prev) => prev.filter((_, j) => j !== i));
                    setSelected((prev) => { const n = new Set(prev); n.delete(i); return n; });
                  }} title={t("img.remove")}>
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* 输出格式 */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">{t("img.format")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Select value={params.format} onValueChange={(v) => v !== null && changeFormat(v)}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {IMAGE_OUTPUT_FORMATS.map((f) => (<SelectItem key={f} value={f}>{t(`img.format.${f}`)}</SelectItem>))}
                </SelectContent>
              </Select>
              <div className="space-y-3 rounded-md border p-4">
                <div className="flex items-center gap-3">
                  <Checkbox id="lossless" checked={isLossless} onCheckedChange={(v) => setParams({ ...params, lossless: v === true })} />
                  <Label htmlFor="lossless">{t("img.losslessMode")}</Label>
                  <span className="text-xs text-muted-foreground">{t("img.losslessHint")}</span>
                </div>
                {formatPreset.supportsQuality && !isLossless && (
                  <div className="space-y-1.5"><Label>{t("img.quality")}: {params.quality}</Label>
                    <Slider min={1} max={100} step={1} value={[params.quality]} onValueChange={(v) => setParams({ ...params, quality: Math.round(sliderVal(v)) })} /></div>
                )}
                {params.format === "jpg" && !isLossless && (
                  <><div className="flex items-center gap-2"><Checkbox id="progressive" checked={params.progressive} onCheckedChange={(v) => setParams({ ...params, progressive: v === true })} /><Label htmlFor="progressive">{t("img.progressive")}</Label></div>
                    <Select value={params.chromaSampling} onValueChange={(v) => v !== null && setParams({ ...params, chromaSampling: v })}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="default">Default</SelectItem><SelectItem value="4:4:4">4:4:4</SelectItem><SelectItem value="4:2:2">4:2:2</SelectItem><SelectItem value="4:2:0">4:2:0</SelectItem></SelectContent></Select></>
                )}
                {params.format === "png" && <div className="space-y-1.5"><Label>{t("img.compression")}: {params.compressionLevel}</Label><Slider min={0} max={9} step={1} value={[params.compressionLevel]} onValueChange={(v) => setParams({ ...params, compressionLevel: Math.round(sliderVal(v)) })} /></div>}
                {params.format === "webp" && <div className="space-y-1.5"><Label>{t("img.webpSpeed")}: {params.webpSpeed}</Label><Slider min={0} max={6} step={1} value={[params.webpSpeed]} onValueChange={(v) => setParams({ ...params, webpSpeed: Math.round(sliderVal(v)) })} /></div>}
                {params.format === "avif" && <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5"><Label>{t("img.avifSpeed")}: {params.avifSpeed}</Label><Slider min={0} max={8} step={1} value={[params.avifSpeed]} onValueChange={(v) => setParams({ ...params, avifSpeed: Math.round(sliderVal(v)) })} /></div>
                    <Select value={String(params.avifDepth)} onValueChange={(v) => v !== null && setParams({ ...params, avifDepth: Number(v) as 8 | 10 | 12 })}><SelectTrigger className="w-32"><Label>{t("img.avifDepth")}</Label><SelectValue /></SelectTrigger><SelectContent><SelectItem value="8">8-bit</SelectItem><SelectItem value="10">10-bit</SelectItem></SelectContent></Select></div>}
                {params.format === "gif" && <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5"><Label>{t("img.gifFps")}: {params.gifFps}</Label><Slider min={1} max={60} step={1} value={[params.gifFps]} onValueChange={(v) => setParams({ ...params, gifFps: Math.round(sliderVal(v)) })} /></div>
                    <div className="space-y-1.5"><Label>{t("img.gifLoop")}: {params.gifLoop}</Label><Slider min={0} max={100} step={1} value={[params.gifLoop]} onValueChange={(v) => setParams({ ...params, gifLoop: Math.round(sliderVal(v)) })} /></div>
                    <div className="space-y-1.5"><Label>{t("img.gifColors")}: {params.gifColors}</Label><Slider min={2} max={256} step={1} value={[params.gifColors]} onValueChange={(v) => setParams({ ...params, gifColors: Math.round(sliderVal(v)) })} /></div></div>}
              </div>
            </CardContent>
          </Card>

          {/* 尺寸调整（含 Tooltip 悬停提示） */}
          <CollapsibleCard title={t("img.sectionSize")} icon={<RotateCw className="size-4" />}>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t("img.resizeMode")}</Label>
                {T(RESIZE_TOOLTIPS[params.resize.mode] ?? "img.tip.none",
                  <Select value={params.resize.mode} onValueChange={(v) => v !== null && setParams({ ...params, resize: { ...params.resize, mode: v as ImageParams["resize"]["mode"] } })} disabled={disabled}>
                    <SelectTrigger className="w-full"><SelectValue placeholder={t(`img.resize.${params.resize.mode}`)} /></SelectTrigger>
                    <SelectContent>
                      {RESIZE_MODES.map((m) => <SelectItem key={m} value={m}>{t(`img.resize.${m}`)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {params.resize.mode === "custom" && (
                <>
                  <div className="space-y-1.5">
                    <Label>{t("img.width")} (px)</Label>
                    <Input type="number" min={1} max={16384} value={params.resize.value || ""} placeholder={t("img.auto")} onChange={(e) => {
                      const v = Math.max(1, Math.min(16384, Number(e.target.value) || 0));
                      setParams({ ...params, resize: { ...params.resize, value: v } });
                    }} disabled={disabled} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("img.height")} (px)</Label>
                    <Input type="number" min={1} max={16384} value={params.resize.value2 || ""} placeholder={t("img.auto")} onChange={(e) => {
                      const v = Math.max(1, Math.min(16384, Number(e.target.value) || 0));
                      setParams({ ...params, resize: { ...params.resize, value2: v } });
                    }} disabled={disabled} />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label>{t("img.resizeMode")}</Label>
                    {T(RESIZE_TOOLTIPS["adaptNone"] ?? "img.tip.adaptNone",
                      <Select value={params.resize.adaptMode} onValueChange={(v) => v !== null && setParams({ ...params, resize: { ...params.resize, adaptMode: v as "none" | "fill" | "contain" | "cover" } })}>
                        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ADAPT_MODES.map((m) => <SelectItem key={m} value={m}>{m === "none" ? t("img.resize.none_adapt") : t(`img.resize.${m}`)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </>
              )}

              {params.resize.mode !== "none" && params.resize.mode !== "custom" && (
                <div className="space-y-1.5">
                  <Label>{t("img.resizeValue")}</Label>
                  <Input type="number" value={params.resize.value} onChange={(e) => setParams({ ...params, resize: { ...params.resize, value: Number(e.target.value) } })} disabled={disabled} />
                </div>
              )}
              {["fixed", "fill", "contain", "cover"].includes(params.resize.mode) && (
                <div className="space-y-1.5">
                  <Label>{t("img.resizeValue2")}</Label>
                  <Input type="number" value={params.resize.value2} onChange={(e) => setParams({ ...params, resize: { ...params.resize, value2: Number(e.target.value) } })} disabled={disabled} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{t("img.dpi")}</Label>
                {T("img.tip.dpi", <Input type="number" value={params.resize.dpi} onChange={(e) => setParams({ ...params, resize: { ...params.resize, dpi: Number(e.target.value) } })} />)}
              </div>
            </div>
          </CollapsibleCard>

          {/* 编辑处理 */}
          <CollapsibleCard title={t("img.sectionEdit")} icon={<Palette className="size-4" />}>
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <Label>{t("img.rotate")}</Label>
                {[0, 90, 180, 270].map((a) => (
                  <Button key={a} variant={params.rotate === a ? "default" : "outline"} size="sm" onClick={() => setParams({ ...params, rotate: a as 0 | 90 | 180 | 270 })} disabled={disabled}>{a}°</Button>
                ))}
                <div className="ml-2 flex gap-1">
                  <Button variant={params.flipH ? "default" : "outline"} size="icon" className="size-8" onClick={() => setParams({ ...params, flipH: !params.flipH })} disabled={disabled} title={t("img.flipH")}><FlipHorizontal className="size-4" /></Button>
                  <Button variant={params.flipV ? "default" : "outline"} size="icon" className="size-8" onClick={() => setParams({ ...params, flipV: !params.flipV })} disabled={disabled} title={t("img.flipV")}><FlipVertical className="size-4" /></Button>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2"><Crop className="size-4 text-muted-foreground" /><Label>{t("img.crop")}</Label><Checkbox checked={params.crop.enabled} onCheckedChange={(v) => setParams({ ...params, crop: { ...params.crop, enabled: v === true } })} disabled={disabled} /></div>
                {params.crop.enabled && <div className="grid grid-cols-4 gap-2 pl-6">
                    <div><Label className="text-xs">W</Label><Input type="number" value={params.crop.w} onChange={(e) => setParams({ ...params, crop: { ...params.crop, w: Number(e.target.value) } })} /></div>
                    <div><Label className="text-xs">H</Label><Input type="number" value={params.crop.h} onChange={(e) => setParams({ ...params, crop: { ...params.crop, h: Number(e.target.value) } })} /></div>
                    <div><Label className="text-xs">X</Label><Input type="number" value={params.crop.x} onChange={(e) => setParams({ ...params, crop: { ...params.crop, x: Number(e.target.value) } })} /></div>
                    <div><Label className="text-xs">Y</Label><Input type="number" value={params.crop.y} onChange={(e) => setParams({ ...params, crop: { ...params.crop, y: Number(e.target.value) } })} /></div>
                    <div className="col-span-4"><Select value={params.crop.aspectRatio} onValueChange={(v) => v !== null && setParams({ ...params, crop: { ...params.crop, aspectRatio: v } })}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent>{ASPECT_RATIOS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div>
                  </div>}
              </div>
              <div className="space-y-3">
                <Label>{t("img.brightness")}: {params.color.brightness.toFixed(2)}</Label><Slider min={-1} max={1} step={0.05} value={[params.color.brightness]} onValueChange={(v) => setParams({ ...params, color: { ...params.color, brightness: sliderVal(v) } })} disabled={disabled} />
                <Label>{t("img.contrast")}: {params.color.contrast.toFixed(2)}</Label><Slider min={0} max={2} step={0.05} value={[params.color.contrast]} onValueChange={(v) => setParams({ ...params, color: { ...params.color, contrast: sliderVal(v) } })} disabled={disabled} />
                <Label>{t("img.saturation")}: {params.color.saturation.toFixed(2)}</Label><Slider min={0} max={3} step={0.05} value={[params.color.saturation]} onValueChange={(v) => setParams({ ...params, color: { ...params.color, saturation: sliderVal(v) } })} disabled={disabled} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2"><Expand className="size-4 text-muted-foreground" /><Label>{t("img.canvas")}</Label><Checkbox checked={params.canvas.enabled} onCheckedChange={(v) => setParams({ ...params, canvas: { ...params.canvas, enabled: v === true } })} disabled={disabled} /></div>
                {params.canvas.enabled && <div className="grid grid-cols-3 gap-2 pl-6">
                    <div><Label className="text-xs">W</Label><Input type="number" value={params.canvas.w} onChange={(e) => setParams({ ...params, canvas: { ...params.canvas, w: Number(e.target.value) } })} /></div>
                    <div><Label className="text-xs">H</Label><Input type="number" value={params.canvas.h} onChange={(e) => setParams({ ...params, canvas: { ...params.canvas, h: Number(e.target.value) } })} /></div>
                    <div><Label className="text-xs">{t("img.canvasBg")}</Label><Input type="color" value={params.canvas.bgColor} onChange={(e) => setParams({ ...params, canvas: { ...params.canvas, bgColor: e.target.value } })} /></div>
                  </div>}
              </div>
            </div>
          </CollapsibleCard>

          {/* 输出设置 */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">{t("img.sectionOutput")}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5"><Label>{t("img.outputDir")}</Label><Input type="text" value={params.outputDir} onChange={(e) => setParams({ ...params, outputDir: e.target.value })} placeholder="(默认：输入文件目录)" /></div>
              <div className="space-y-1.5"><Label>{t("img.namingPrefix")}</Label><Input value={params.namingPrefix} onChange={(e) => setParams({ ...params, namingPrefix: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>{t("img.namingSuffix")}</Label><Input value={params.namingSuffix} onChange={(e) => setParams({ ...params, namingSuffix: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>{t("img.namingSeq")}</Label><Input type="number" value={params.namingSeq} onChange={(e) => setParams({ ...params, namingSeq: Number(e.target.value) })} /></div>
              <div className="space-y-1.5">
                <Label>{t("img.onConflict")}</Label>
                <Select value={params.onConflict} onValueChange={(v) => v !== null && setParams({ ...params, onConflict: v as ImageParams["onConflict"] })}>
                  <SelectTrigger className="w-full"><span>{t(`img.conflict.${params.onConflict}`)}</span></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="overwrite">{t("img.conflict.overwrite")}</SelectItem>
                    <SelectItem value="autoNumber">{t("img.conflict.autoNumber")}</SelectItem>
                    <SelectItem value="ask">{t("img.conflict.ask")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* 开始 */}
          <TooltipProvider delay={300}>
            <Tooltip open={selectedCount === 0 ? undefined : false}>
              <TooltipTrigger>
                <span tabIndex={0}>
                  <Button size="lg" className="w-full" onClick={startBatch} disabled={selectedCount === 0 || processing}>
                    <Play className="size-4" />{processing ? t("img.processing") : t("img.startBatch")}
                  </Button>
                </span>
              </TooltipTrigger>
              {selectedCount === 0 && <TooltipContent side="top">{t("img.noSelection")}</TooltipContent>}
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </DropZone>
  );
}

function CollapsibleCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <Collapsible defaultOpen>
        <CardHeader className="pb-3">
          <CollapsibleTrigger className="flex w-full items-center gap-2 text-left">
            {icon}
            <CardTitle className="flex-1 text-base">{title}</CardTitle>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>{children}</CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}