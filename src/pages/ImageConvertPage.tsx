import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ImagePlus, FolderOpen, Save, Trash2, RotateCw, FlipHorizontal, FlipVertical, Crop, Palette, Expand } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropZone } from "@/components/shared/DropZone";
import { CommandPreviewCard } from "@/components/shared/CommandPreviewCard";
import { useCommandPreview, normalizeUserArgs } from "@/components/shared/useCommandPreview";
import { useI18n } from "@/i18n";
import { useTasks } from "@/tasks/TaskProvider";
import { useSettings } from "@/settings/SettingsProvider";
import { api, invoke } from "@/lib/tauri";
import { buildImageArgs, genOutputPath, buildGifSplitArgs, buildGifCombineArgs, buildConcatListContent, sortByTrailingNumber } from "@/image/builder";
import { defaultImageParams, IMAGE_OUTPUT_FORMATS, type ImageFileItem, type ImageParams, type GifMode } from "@/image/types";
import { INPUT_IMAGE_EXTS, getPreset, applyFormatDefaults } from "@/image/formatPresets";
import { basename } from "@/lib/format";
import { useRegisterPageSnapshot, useTabId, useTabInitialState } from "@/tabs/TabManager";
import type { EncoderPreset } from "@/types";

/** 复制标签时复刻的图片转换页状态快照（selected 转数组便于序列化） */
interface ImageConvertSnapshot {
  files: ImageFileItem[];
  selected: number[];
  params: ImageParams;
  presetId: string;
  gifMode: GifMode;
}

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
  const { settings, update } = useSettings();
  const tabId = useTabId();

  const init = useTabInitialState<ImageConvertSnapshot>();
  const [files, setFiles] = useState<ImageFileItem[]>(init?.files ?? []);
  const [selected, setSelected] = useState<Set<number>>(init?.selected ? new Set(init.selected) : new Set());
  const [params, setParams] = useState<ImageParams>(init?.params ?? defaultImageParams());
  const [processing, setProcessing] = useState(false);
  const [presetId, setPresetId] = useState(init?.presetId ?? "");
  // GIF 输出模式：none=普通转换 / split=拆分 / combine=合成（两者互斥，可同时关闭）
  const [gifMode, setGifMode] = useState<GifMode>(init?.gifMode ?? "none");

  // 复制标签：聚合最新状态供 TabManager 深拷贝注入新标签
  const snapRef = useRef<ImageConvertSnapshot>({ files, selected: [...selected], params, presetId, gifMode });
  snapRef.current = { files, selected: [...selected], params, presetId, gifMode };
  useRegisterPageSnapshot("image-convert", () => snapRef.current);

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

  // ---- GIF 拆分/合成模式派生状态（仅 format=gif 时参与）----
  const isSplitMode = gifMode === "split";
  const isCombineMode = gifMode === "combine";
  /** 拆分模式：当前选中文件中 GIF 文件（按文件列表顺序） */
  const splitGifFiles = useMemo(
    () => files.filter((f, i) => selected.has(i) && f.ext.toLowerCase() === "gif"),
    [files, selected],
  );
  /** 合成模式：按序号升序排序后的选中图片（静态图片序列；GIF 不作为合成输入） */
  const combineImages = useMemo(() => {
    const sel = files.filter((f, i) => selected.has(i) && f.ext.toLowerCase() !== "gif");
    return sortByTrailingNumber(sel);
  }, [files, selected]);

  const changeFormat = (fmt: string) => {
    setParams(applyFormatDefaults(params, fmt as ImageParams["format"]));
    // 切换输出格式离开 gif 时：自动取消拆分/合成模式，恢复默认关闭
    if (fmt !== "gif") setGifMode("none");
  };

  // ---- 命令预览（自动生成；以第一个选中文件为代表）----
  const firstSelectedPath = useMemo(() => {
    const idx = [...selected][0];
    return idx !== undefined ? files[idx]?.path ?? "" : "";
  }, [files, selected]);
  const autoArgs = useMemo<string[] | null>(() => {
    if (isSplitMode) {
      // 拆分：以第一个 GIF 为代表，预览拆帧命令（输出序列模式）
      const gif = splitGifFiles[0];
      if (!gif) return null;
      const { args } = buildGifSplitArgs(gif.path, params.outputDir);
      return args;
    }
    if (isCombineMode) {
      // 合成：以列表文件为输入预览（占位路径，实际运行时写入）
      if (combineImages.length < 2) return null;
      const out = genOutputPath(combineImages[0].path, "gif", 0, params.namingPrefix, params.namingSuffix, params.namingSeq, params.outputDir);
      return buildGifCombineArgs(
        `${params.outputDir || ""}/_combine_preview.txt`,
        out,
        params.gifLoop,
        params.gifColors,
      );
    }
    if (!firstSelectedPath) return null;
    try {
      const out = genOutputPath(firstSelectedPath, params.format, 0, params.namingPrefix, params.namingSuffix, params.namingSeq, params.outputDir);
      return buildImageArgs(params, firstSelectedPath, out);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [firstSelectedPath, params, selected, isSplitMode, isCombineMode, splitGifFiles, combineImages]);

  const cmdPreview = useCommandPreview(autoArgs);

  /** 将用户编辑的命令作为模板，替换输入/输出路径后应用到各文件 */
  const substituteCmd = (text: string, fromInput: string, fromOutput: string, toInput: string, toOutput: string): string[] => {
    let t = text;
    if (fromInput) t = t.split(fromInput).join(toInput);
    if (fromOutput) t = t.split(fromOutput).join(toOutput);
    return normalizeUserArgs(t);
  };

  const startBatch = async () => {
    if (selectedCount === 0) return;
    setProcessing(true);
    // 拆分模式：每个 GIF 生成一个任务，拆为 PNG 序列
    if (isSplitMode) {
      for (const gif of splitGifFiles) {
        const { args, outputPattern } = buildGifSplitArgs(gif.path, params.outputDir);
        guardAddTask({
          name: `${basename(gif.path)} → PNG 序列`,
          args,
          inputPath: gif.path,
          outputPath: outputPattern,
        }, tabId);
      }
      setProcessing(false);
      toast.success(t("img.gifSplitDone", { n: splitGifFiles.length }));
      return;
    }
    // 合成模式：所有选中序号图片按序合成为单个 GIF
    if (isCombineMode) {
      if (combineImages.length < 2) {
        toast.error(t("img.gifCombineNoInput"));
        setProcessing(false);
        return;
      }
      try {
        const first = combineImages[0];
        const out = genOutputPath(first.path, "gif", 0, params.namingPrefix, params.namingSuffix, params.namingSeq, params.outputDir);
        // 写入临时 concat 列表文件（合成完成后保留在输出目录，见 buildConcatListContent）
        const listPath = `${params.outputDir || ""}/_combine_${Date.now()}.txt`;
        await api.writeTextFile(listPath, buildConcatListContent(combineImages.map((x) => x.path), params.gifFps));
        const args = buildGifCombineArgs(listPath, out, params.gifLoop, params.gifColors);
        guardAddTask({
          name: `${basename(first.path)} → GIF 合成`,
          args,
          inputPath: first.path,
          outputPath: out,
        }, tabId);
        setProcessing(false);
        toast.success(t("img.gifCombineDone", { n: combineImages.length }));
      } catch (e) {
        console.error(e);
        setProcessing(false);
        toast.error(t("img.gifCombineNoInput"));
      }
      return;
    }
    // 普通模式：批量转换（原有逻辑不变）
    const selectedFiles = files.filter((_, i) => selected.has(i));
    // 用户编辑过 → 以编辑命令为模板，替换各文件输入/输出路径
    const edited = cmdPreview.dirty && cmdPreview.text.trim();
    const fromInput = firstSelectedPath;
    const fromOutput = autoArgs?.[autoArgs.length - 1] ?? "";
    for (let i = 0; i < selectedFiles.length; i++) {
      const f = selectedFiles[i];
      const out = genOutputPath(f.path, params.format, i, params.namingPrefix, params.namingSuffix, params.namingSeq, params.outputDir);
      const args = edited
        ? substituteCmd(cmdPreview.text, fromInput, fromOutput, f.path, out)
        : buildImageArgs(params, f.path, out);
      guardAddTask({
        name: `${basename(f.path)} → ${basename(out)}`,
        args,
        inputPath: f.path,
        outputPath: out,
      }, tabId);
    }
    setProcessing(false);
  };

  const sliderVal = (v: number | readonly number[]) => (Array.isArray(v) ? v[0] ?? 0 : v);
  const disabled = isLossless;

  // ---- 预设 ----
  const imagePresets = useMemo(
    () => (settings?.presets ?? []).filter((p) => p.category === "image"),
    [settings?.presets],
  );

  /** 应用图片预设：回填全部图片参数（outputDir 属路径配置，不入预设）；空 id =（默认参数）重置 */
  const applyPreset = (id: string) => {
    setPresetId(id);
    const p = imagePresets.find((x) => x.id === id);
    if (!p) {
      // （默认参数）：恢复出厂默认，保留当前输出目录
      setParams((prev) => ({ ...defaultImageParams(), outputDir: prev.outputDir }));
      return;
    }
    const saved = p.params as Partial<ImageParams>;
    setParams((prev) => ({ ...defaultImageParams(), ...saved, outputDir: prev.outputDir }));
  };

  /** 保存当前图片参数为预设（标记 category=image，outputDir 不入预设） */
  const savePreset = () => {
    const name = window.prompt(t("img.savePresetName"), "My Preset");
    if (!name?.trim()) return;
    const now = Date.now();
    const { outputDir: _outputDir, ...paramRest } = params;
    const preset: EncoderPreset = {
      id: crypto.randomUUID(),
      name: name.trim(),
      category: "image",
      createdAt: now,
      updatedAt: now,
      params: paramRest as unknown as Record<string, unknown>,
    };
    update({ presets: [...(settings?.presets ?? []), preset] });
    toast.success(t("img.presetSaved"));
  };

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
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold">{t("img.title")}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">{t("img.desc")}</p>
            </div>
            {/* 预设快速调用（与视频转换页一致） */}
            <div className="flex items-center gap-2">
              <Select value={presetId} onValueChange={(v) => v !== null && applyPreset(v)}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder={t("img.presetNone")}>
                    {(val) => {
                      const p = imagePresets.find((x) => x.id === val);
                      return p ? p.name : t("img.presetNone");
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t("img.presetNone")}</SelectItem>
                  {imagePresets.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={savePreset} title={t("img.savePreset")}>
                <Save className="size-4" />
              </Button>
            </div>
          </div>

          {/* 文件列表（含勾选） */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                  <CardTitle className="text-base">
                    {isSplitMode ? t("img.fileListSplit") : isCombineMode ? t("img.fileListCombine") : t("img.fileList")}
                  </CardTitle>
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
                {params.format === "gif" && (
                  <div className="space-y-3">
                    {/* 拆分 / 合成模式（互斥；可同时关闭） */}
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="gif-split"
                        checked={isSplitMode}
                        onCheckedChange={(v) => setGifMode(v === true ? "split" : "none")}
                      />
                      <Label htmlFor="gif-split">{t("img.gifSplitMode")}</Label>
                      <Checkbox
                        id="gif-combine"
                        checked={isCombineMode}
                        onCheckedChange={(v) => setGifMode(v === true ? "combine" : "none")}
                      />
                      <Label htmlFor="gif-combine">{t("img.gifCombineMode")}</Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {isSplitMode ? t("img.gifSplitHint") : isCombineMode ? t("img.gifCombineHint") : ""}
                    </p>
                    <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5"><Label>{t("img.gifFps")}: {params.gifFps}</Label><Slider min={1} max={60} step={1} value={[params.gifFps]} onValueChange={(v) => setParams({ ...params, gifFps: Math.round(sliderVal(v)) })} /></div>
                    <div className="space-y-1.5"><Label>{t("img.gifLoop")}: {params.gifLoop}</Label><Slider min={0} max={100} step={1} value={[params.gifLoop]} onValueChange={(v) => setParams({ ...params, gifLoop: Math.round(sliderVal(v)) })} /></div>
                    <div className="space-y-1.5"><Label>{t("img.gifColors")}: {params.gifColors}</Label><Slider min={2} max={256} step={1} value={[params.gifColors]} onValueChange={(v) => setParams({ ...params, gifColors: Math.round(sliderVal(v)) })} /></div>
                    </div>
                  </div>
                )}
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

          {/* 命令预览 + 开始（可编辑 textarea） */}
          <CommandPreviewCard
            value={cmdPreview.text}
            onEdit={cmdPreview.setText}
            startLabelKey={isSplitMode ? "img.gifSplitStart" : isCombineMode ? "img.gifCombineStart" : "img.startBatch"}
            onStart={startBatch}
            startDisabled={
              isSplitMode
                ? splitGifFiles.length === 0 || processing
                : isCombineMode
                  ? combineImages.length < 2 || processing
                  : selectedCount === 0 || processing
            }
            onCopy={() => {
              void navigator.clipboard.writeText(cmdPreview.text);
              void import("sonner").then(({ toast }) => toast.success(t("common.done")));
            }}
            copyDisabled={!autoArgs}
            overwriteOpen={cmdPreview.overwriteOpen}
            overwriteText={cmdPreview.pendingText}
            onConfirmOverwrite={cmdPreview.confirmOverwrite}
            onCancelOverwrite={cmdPreview.cancelOverwrite}
            empty={!autoArgs}
            emptyText={
              isSplitMode && splitGifFiles.length === 0
                ? t("img.gifSplitNoInput")
                : isCombineMode && combineImages.length < 2
                  ? t("img.gifCombineNoInput")
                  : undefined
            }
          />
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