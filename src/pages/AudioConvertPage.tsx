import { useCallback, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Play, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useSettings } from "@/settings/SettingsProvider";
import { useTasks } from "@/tasks/TaskProvider";
import { api } from "@/lib/tauri";
import { buildAudioArgs, fmtSec, type AudioSegment } from "@/audio/builder";
import { AUDIO_BIT_DEPTHS, AUDIO_CODECS, AUDIO_FORMATS, AUDIO_SAMPLE_RATES } from "@/audio/formatPresets";
import { defaultAudioParams, type AudioParams } from "@/audio/types";
import { DropZone } from "@/components/shared/DropZone";
import { FileRow } from "@/components/shared/FileRow";
import { basename, deriveOutputPath } from "@/lib/format";
import type { MediaBasicInfo } from "@/types";

type AudioMode = "convert" | "split" | "concat";

const CHANNEL_MODES = [
  { value: "none", key: "aef.channel.none" as const },
  { value: "swap", key: "aef.channel.swap" as const },
  { value: "mono", key: "aef.channel.mono" as const },
  { value: "stereo-upmix", key: "aef.channel.upmix" as const },
  { value: "downmix", key: "aef.channel.downmix" as const },
];

/** 音频转换页（PRD 4.1-4.4）：转换/提取/分割/拼接 + 音量声道处理 + 滤镜 */
export function AudioConvertPage() {
  const { t } = useI18n();
  const { settings } = useSettings();
  const { guardAddTask } = useTasks();

  const [input, setInput] = useState("");
  const [media, setMedia] = useState<MediaBasicInfo | null>(null);
  const [format, setFormat] = useState("mp3");
  const [output, setOutput] = useState("");
  const [audio, setAudio] = useState<AudioParams>(defaultAudioParams);
  const [mode, setMode] = useState<AudioMode>("convert");

  // 转换模式
  const [extractTrack, setExtractTrack] = useState(false);
  const [trackIndex, setTrackIndex] = useState(0);
  const [clipStart, setClipStart] = useState(0);
  const [clipEnd, setClipEnd] = useState(0);

  // 分割
  const [splitEvery, setSplitEvery] = useState(60);

  // 拼接
  const [segments, setSegments] = useState<AudioSegment[]>([
    { startSec: 0, endSec: -1 },
    { startSec: -1, endSec: -1 },
  ]);
  const durationSec = media?.ok ? media.durationMs / 1000 : 0;

  const isVideoInput = media?.ok && media.hasVideo;

  /** 选输入 */
  const pickInput = useCallback(async (path?: string) => {
    const picked = path ?? await open({
      multiple: false,
      directory: false,
      title: t("audio.input"),
      filters: [
        { name: "Media", extensions: ["mp3", "flac", "wav", "ogg", "opus", "m4a", "aac", "wma", "aiff", "mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "ts"] },
        { name: "All", extensions: ["*"] },
      ],
    });
    if (typeof picked !== "string" || !picked) return;
    setInput(picked);
    const dir = picked.replace(/[\\/][^\\/]+$/, "");
    window.dispatchEvent(new CustomEvent("ffmt:last-input-dir", { detail: dir }));
    // 使用默认输出路径，不跟随输入目录；空路径回落 opt
    const cfgDir = settings?.outputPaths?.audioConvert;
    const defaultDir = cfgDir || (await api.getOptDir());
    const baseInput = defaultDir + "/" + basename(picked);
    setOutput(deriveOutputPath(baseInput, format));
    try {
      const info = await api.mediaProbeBasic(picked);
      setMedia(info);
      setTrackIndex(0);
      // 拼接模式默认段
      if (info.ok && info.durationMs > 0) {
        const d = info.durationMs / 1000;
        setSegments([{ startSec: 0, endSec: Math.min(30, d) }, { startSec: Math.min(30, d), endSec: -1 }]);
      }
    } catch {
      setMedia(null);
    }
  }, [t, format]);

  /** 智能匹配格式 */
  const applyFormat = useCallback(
    async (ext: string) => {
      setFormat(ext);
      if (input) {
        const cfgDir = settings?.outputPaths?.audioConvert || (await api.getOptDir());
        const baseInput = cfgDir + "/" + basename(input);
        setOutput(deriveOutputPath(baseInput, ext));
      }
      const p = AUDIO_FORMATS.find((f) => f.ext === ext);
      if (!p) return;
      setAudio((a) => ({
        ...a,
        acodec: p.acodec,
        mode: p.mode,
        bitrateK: p.bitrateK,
        vbrQuality: p.vbrQuality,
      }));
    },
    [input],
  );

  const audioStreams = useMemo(
    () => (media?.streams ?? []).filter((s) => s.codecType === "audio"),
    [media],
  );

  // copy 判定：有损滤镜在 copy 下禁用
  const copyAudio = audio.acodec === "copy";

  const enqueueOne = (out: string, params: AudioParams, extra?: { clip?: AudioSegment | null; concat?: AudioSegment[] | null; track?: number }) => {
    const args = buildAudioArgs({
      input,
      output: out,
      audio: params,
      clip: extra?.clip ?? null,
      concat: extra?.concat ?? null,
      extract: extra?.track !== undefined ? { trackIndex: extra.track } : null,
    });
    void guardAddTask({
      name: `${basename(input)} → ${basename(out)}`,
      args,
      inputPath: input,
      outputPath: out,
    });
  };

  /** 转换 / 提取 */
  const startConvert = () => {
    if (!input || !output) return;
    enqueueOne(output, audio, {
      clip:
        clipStart > 0 || clipEnd > 0
          ? { startSec: clipStart, endSec: clipEnd > 0 ? clipEnd : -1 }
          : null,
      track: extractTrack && isVideoInput ? trackIndex : undefined,
    });
  };

  /** 分割：按每段时长切分 → 批量入队 */
  const startSplit = () => {
    if (!input || durationSec <= 0) return;
    const count = Math.max(2, Math.floor(durationSec / Math.max(1, splitEvery)));
    const segDur = durationSec / count;
    const outs: string[] = [];
    const params = audio;
    for (let i = 0; i < count; i++) {
      const start = i * segDur;
      const end = i === count - 1 ? durationSec : (i + 1) * segDur;
      const out = insertSuffix(output, `_${String(i + 1).padStart(2, "0")}`);
      outs.push(out);
      void guardAddTask({
        name: `${basename(input)} → ${basename(out)}`,
        args: buildAudioArgs({
          input,
          output: out,
          audio: params,
          clip: { startSec: start, endSec: end },
        }),
        inputPath: input,
        outputPath: out,
      });
    }
  };

  /** 拼接 */
  const startConcat = () => {
    if (!input || segments.length < 2) return;
    const valid = segments.filter((s) => s.startSec >= 0);
    if (valid.length < 2) return;
    enqueueOne(output, audio, { concat: valid.map((s) => ({ ...s })) });
  };

  const addSegment = () => {
    const lastEnd = segments[segments.length - 1].endSec;
    const start = lastEnd >= 0 ? lastEnd : durationSec * 0.5;
    setSegments([...segments, { startSec: start, endSec: -1 }]);
  };

  const renderSplitPreview = useMemo(() => {
    if (durationSec <= 0) return 0;
    return Math.max(1, Math.floor(durationSec / Math.max(1, splitEvery)));
  }, [durationSec, splitEvery]);

  return (
    <DropZone onFiles={([path]) => path && void pickInput(path)} accept="audio" className="h-full">
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-5 p-6">
        <div>
          <h1 className="text-xl font-semibold">{t("audio.title")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("audio.desc")}</p>
        </div>

        {/* 输入 / 格式 / 输出 */}
        <Card>
          <CardContent className="space-y-4 pt-6">
            <FileRow label={t("audio.input")} value={input} onBrowse={() => void pickInput()} readOnly />
            {media?.ok && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{fmtSec(durationSec)}</Badge>
                {audioStreams.map((s, i) => (
                  <Badge key={i} variant="outline">
                    {s.codecName} {s.sampleRate ? `${s.sampleRate}Hz` : ""}
                    {s.channels ? `${s.channels}ch` : ""}
                  </Badge>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>{t("audio.format")}</Label>
                <Select value={format} onValueChange={(v) => v !== null && applyFormat(v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AUDIO_FORMATS.map((f) => (
                      <SelectItem key={f.ext} value={f.ext}>{t(f.label)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>{t("audio.outputPath")}</Label>
                <Input type="text" value={output} onChange={(e) => setOutput(e.target.value)} placeholder="opt" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("audio.losslessHint")}</p>

            {/* 模式切换 */}
            <div className="flex items-center gap-2">
              <Label>{t("audio.mode")}</Label>
              <Button type="button" size="sm" variant={mode === "convert" ? "default" : "outline"} onClick={() => setMode("convert")}>
                {t("audio.mode.convert")}
              </Button>
              <Button type="button" size="sm" variant={mode === "split" ? "default" : "outline"} onClick={() => setMode("split")}>
                {t("audio.mode.split")}
              </Button>
              <Button type="button" size="sm" variant={mode === "concat" ? "default" : "outline"} onClick={() => setMode("concat")}>
                {t("audio.mode.concat")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 模式内容 */}
        <Card>
          <CardContent className="space-y-4 pt-6">
            {mode === "convert" && (
              <>
                {isVideoInput && (
                  <div className="space-y-2 rounded-md border border-border p-3">
                    <div className="flex items-center gap-2">
                      <Checkbox id="extract" checked={extractTrack} onCheckedChange={(c) => setExtractTrack(!!c)} />
                      <Label htmlFor="extract" className="cursor-pointer">{t("audio.extractTrack")}</Label>
                    </div>
                    {extractTrack && (
                      <div className="flex items-center gap-2">
                        <Label className="w-16 shrink-0 text-xs">{t("audio.track")}</Label>
                        <Select value={String(trackIndex)} onValueChange={(v) => v !== null && setTrackIndex(Number(v))}>
                          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="-1">{t("audio.allTracks")}</SelectItem>
                            {audioStreams.map((s, i) => (
                              <SelectItem key={i} value={String(i)}>
                                #{i + 1} {s.codecName} {s.channels ? `${s.channels}ch` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>{t("audio.clipStart")}</Label>
                    <Input type="number" min={0} step={1} value={clipStart || ""} placeholder="0"
                      onChange={(e) => setClipStart(Math.max(0, Number(e.target.value) || 0))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("audio.clipEnd")}</Label>
                    <Input type="number" min={0} step={1} value={clipEnd || ""} placeholder="0"
                      onChange={(e) => setClipEnd(Math.max(0, Number(e.target.value) || 0))} />
                  </div>
                </div>
              </>
            )}

            {mode === "split" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <Label>{t("audio.splitEvery")}（共 {durationSec > 0 ? renderSplitPreview : "—"} 段）</Label>
                    <span className="text-xs text-muted-foreground">{splitEvery}s</span>
                  </div>
                  <Slider
                    min={5}
                    max={Math.max(10, Math.floor(durationSec || 300))}
                    step={5}
                    value={[splitEvery]}
                    onValueChange={(v) => {
                      const n = Array.isArray(v) ? v[0] : v;
                      if (n !== undefined) setSplitEvery(Math.round(n));
                    }}
                  />
                </div>
                <p className="col-span-2 text-xs text-muted-foreground">
                  {t("audio.splitPreview", { count: renderSplitPreview })}
                </p>
              </div>
            )}

            {mode === "concat" && (
              <div className="space-y-2">
                {segments.map((seg, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                    <span className="w-5 text-center text-sm text-muted-foreground">{i + 1}</span>
                    <span className="text-xs text-muted-foreground">{t("audio.clipStart")}</span>
                    <Input
                      className="h-8 w-24 font-mono text-xs"
                      type="number"
                      min={0}
                      step={1}
                      value={seg.startSec < 0 ? "" : seg.startSec}
                      placeholder={t("common.auto")}
                      onChange={(e) => {
                        const n = Math.max(0, Number(e.target.value) || -1);
                        setSegments((prev) => prev.map((s, j) => (j === i ? { ...s, startSec: n } : s)));
                      }}
                    />
                    <span className="text-xs text-muted-foreground">{t("audio.clipEnd")}</span>
                    <Input
                      className="h-8 w-24 font-mono text-xs"
                      type="number"
                      min={0}
                      step={1}
                      value={seg.endSec < 0 ? "" : seg.endSec}
                      placeholder={t("clip.endToEnd")}
                      onChange={(e) => {
                        const n = Math.max(0, Number(e.target.value) || -1);
                        setSegments((prev) => prev.map((s, j) => (j === i ? { ...s, endSec: n } : s)));
                      }}
                    />
                    <Button variant="ghost" size="icon" className="size-7 ml-auto text-destructive" disabled={segments.length <= 2}
                      onClick={() => setSegments((prev) => prev.filter((_, j) => j !== i))}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addSegment}>
                  <Plus className="size-3.5" />
                  {t("clip.addSegment")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 编码参数 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("audio.vcodec")}</CardTitle>
            <CardDescription />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {AUDIO_CODECS.map((c) => (
                <Button
                  key={c.value}
                  type="button"
                  size="sm"
                  variant={audio.acodec === c.value ? "default" : "outline"}
                  onClick={() => {
                    // 切 copy：强制 lossless 模式（copy 无质量概念）
                    setAudio({ ...audio, acodec: c.value, mode: c.value === "copy" ? "lossless" : audio.mode });
                  }}
                >
                  {t(c.labelKey)}
                </Button>
              ))}
            </div>

            <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-3", copyAudio && "pointer-events-none opacity-50")}>
              <div className="space-y-1.5">
                <Label>{t("audio.qualityMode")}</Label>
                <Select
                  value={audio.mode}
                  onValueChange={(v) => v !== null && setAudio({ ...audio, mode: v as AudioParams["mode"] })}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cbr">{t("audio.mode.cbr")}</SelectItem>
                    <SelectItem value="vbr">{t("audio.mode.vbr")}</SelectItem>
                    <SelectItem value="lossless">{t("audio.mode.lossless")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {audio.mode === "cbr" ? (
                <div className="space-y-1.5">
                  <Label>{t("audio.bitrate")}</Label>
                  <Input type="number" min={32} step={16} value={audio.bitrateK || ""}
                    onChange={(e) => setAudio({ ...audio, bitrateK: Math.max(0, Number(e.target.value) || 0) })} />
                </div>
              ) : audio.mode === "vbr" ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <Label>{t("audio.vbrQuality")}</Label>
                    <span className="text-xs text-muted-foreground">{audio.vbrQuality}</span>
                  </div>
                  <Slider min={0} max={9} step={1} value={[audio.vbrQuality]}
                    onValueChange={(v) => {
                      const n = Array.isArray(v) ? v[0] : v;
                      if (n !== undefined) setAudio({ ...audio, vbrQuality: Math.round(n) });
                    }} />
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline">{t("audio.mode.lossless")}</Badge>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{t("audio.sampleRate")}</Label>
                <Select value={String(audio.sampleRate || 0)}
                  onValueChange={(v) => v !== null && setAudio({ ...audio, sampleRate: Number(v) })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t("common.auto")}</SelectItem>
                    {AUDIO_SAMPLE_RATES.map((r) => (
                      <SelectItem key={r} value={String(r)}>{r} Hz</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("audio.bitDepth")}</Label>
                <Select value={String(audio.bitDepth || 0)}
                  onValueChange={(v) => v !== null && setAudio({ ...audio, bitDepth: Number(v) })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t("common.auto")}</SelectItem>
                    {AUDIO_BIT_DEPTHS.map((b) => (
                      <SelectItem key={b} value={String(b)}>{b} bit</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("audio.channels")}</Label>
                <Select value={String(audio.channels || 0)}
                  onValueChange={(v) => v !== null && setAudio({ ...audio, channels: Number(v) })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t("video.channels.auto")}</SelectItem>
                    <SelectItem value="1">{t("video.channels.mono")}</SelectItem>
                    <SelectItem value="2">{t("video.channels.stereo")}</SelectItem>
                    <SelectItem value="6">{t("video.channels.51")}</SelectItem>
                    <SelectItem value="8">{t("video.channels.71")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 音量 / 声道 / 滤镜 */}
        <Card className={cn(copyAudio && "opacity-60")}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {t("aef.volume")} / {t("aef.channel")} / {t("video.sectionFilters")}
              {copyAudio && <Badge variant="destructive" className="ml-2 text-[10px]">{t("codec.copyHint")}</Badge>}
            </CardTitle>
            <CardDescription />
          </CardHeader>
          <CardContent className={cn("space-y-5", copyAudio && "pointer-events-none opacity-50")}>
            {/* 音量 */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <Label>{t("aef.gain")}</Label>
                  <span className="text-xs text-muted-foreground">{audio.gainDb > 0 ? "+" : ""}{audio.gainDb} dB</span>
                </div>
                <Slider min={-30} max={30} step={1} value={[audio.gainDb]}
                  onValueChange={(v) => {
                    const n = Array.isArray(v) ? v[0] : v;
                    if (n !== undefined) setAudio({ ...audio, gainDb: n });
                  }} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("aef.fadeIn")}</Label>
                <Input type="number" min={0} step={0.5} value={audio.fadeInSec || ""}
                  onChange={(e) => setAudio({ ...audio, fadeInSec: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("aef.fadeOut")}</Label>
                <Input type="number" min={0} step={0.5} value={audio.fadeOutSec || ""}
                  onChange={(e) => setAudio({ ...audio, fadeOutSec: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="loudnorm" checked={audio.loudnorm} onCheckedChange={(c) => setAudio({ ...audio, loudnorm: !!c })} />
              <Label htmlFor="loudnorm" className="cursor-pointer">{t("aef.loudnorm")}</Label>
            </div>

            {/* 声道 */}
            <div className="space-y-1.5">
              <Label>{t("aef.channel")}</Label>
              <div className="flex flex-wrap gap-1.5">
                {CHANNEL_MODES.map((m) => (
                  <Button key={m.value} type="button" size="sm"
                    variant={audio.channelMode === m.value ? "default" : "outline"}
                    onClick={() => setAudio({ ...audio, channelMode: m.value as AudioParams["channelMode"] })}>
                    {t(m.key)}
                  </Button>
                ))}
              </div>
            </div>

            {/* 滤镜开关 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <Checkbox id="a-denoise" checked={audio.denoise} onCheckedChange={(c) => setAudio({ ...audio, denoise: !!c })} />
                <Label htmlFor="a-denoise" className="cursor-pointer">{t("aef.denoise")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="a-vocal" checked={audio.vocalRemoval} onCheckedChange={(c) => setAudio({ ...audio, vocalRemoval: !!c })} />
                <Label htmlFor="a-vocal" className="cursor-pointer">{t("aef.vocal")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="a-reverb" checked={audio.reverb} onCheckedChange={(c) => setAudio({ ...audio, reverb: !!c })} />
                <Label htmlFor="a-reverb" className="cursor-pointer">{t("aef.reverb")}</Label>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <Label>{t("aef.tempo")}</Label>
                  <span className="text-xs text-muted-foreground">{audio.tempo.toFixed(2)}x</span>
                </div>
                <Slider min={0.5} max={2} step={0.05} value={[audio.tempo]}
                  onValueChange={(v) => {
                    const n = Array.isArray(v) ? v[0] : v;
                    if (n !== undefined) setAudio({ ...audio, tempo: Math.round(n * 100) / 100 });
                  }} />
              </div>
            </div>

            {/* EQ */}
            <div className="space-y-3 rounded-md border border-border p-3">
              <Label>{t("aef.eq")}</Label>
              {(
                [
                  { k: "aef.eqBass" as const, v: audio.eqBass },
                  { k: "aef.eqMid" as const, v: audio.eqMid },
                  { k: "aef.eqTreble" as const, v: audio.eqTreble },
                ]
              ).map((row) => (
                <div key={row.k} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-xs">{t(row.k)}</span>
                  <Slider min={-12} max={12} step={1} value={[row.v]}
                    onValueChange={(val) => {
                      const n = Array.isArray(val) ? val[0] : val;
                      if (n === undefined) return;
                      if (row.k === "aef.eqBass") setAudio({ ...audio, eqBass: n });
                      else if (row.k === "aef.eqMid") setAudio({ ...audio, eqMid: n });
                      else setAudio({ ...audio, eqTreble: n });
                    }}
                    className="flex-1" />
                  <span className="w-10 shrink-0 text-right font-mono text-xs text-muted-foreground">{row.v > 0 ? "+" : ""}{row.v}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 操作 */}
        <div className="flex items-center gap-2 pb-4">
          {mode === "convert" && (
            <Button onClick={startConvert} disabled={!input || !output}>
              <Play className="size-4" />
              {t("audio.start")}
            </Button>
          )}
          {mode === "split" && (
            <Button onClick={startSplit} disabled={!input || durationSec <= 0}>
              <Play className="size-4" />
              {t("audio.splitAdd")}
            </Button>
          )}
          {mode === "concat" && (
            <Button onClick={startConcat} disabled={!input || segments.filter((s) => s.startSec >= 0).length < 2}>
              <Play className="size-4" />
              {t("audio.start")}
            </Button>
          )}
        </div>
      </div>
      </div>
    </DropZone>
  );
}

/** 在扩展名前插入后缀：song.mp3 + "_01" → song_01.mp3 */
function insertSuffix(path: string, suffix: string): string {
  const dot = path.lastIndexOf(".");
  const slash = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  if (dot > slash) {
    return path.slice(0, dot) + suffix + path.slice(dot);
  }
  return path + suffix;
}