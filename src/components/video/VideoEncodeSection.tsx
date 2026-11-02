import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import {
  AUDIO_CODECS,
  LEVELS,
  PIX_FMTS,
  PROFILES,
  QUALITY_MODES,
  TUNES,
  VIDEO_CODECS,
  X264_PRESETS,
} from "@/video/formatPresets";
import type { VideoAudioParams, VideoParams } from "@/video/types";

/**
 * 视频 + 音频编码参数表单。
 * - videoDisabled=true（视频流复制 copy）时视频参数与滤镜灰化
 * - audioDisabled=true（音频流复制 copy）时音频参数灰化
 * - 转换页与剪辑页共用
 */
export function VideoEncodeSection({
  video,
  audio,
  onVideoChange,
  onAudioChange,
  disabled,
}: {
  video: VideoParams;
  audio: VideoAudioParams;
  onVideoChange: (v: VideoParams) => void;
  onAudioChange: (a: VideoAudioParams) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-5">
      <VideoCard video={video} onChange={onVideoChange} disabled={disabled} />
      <Separator />
      <AudioCard audio={audio} onChange={onAudioChange} disabled={disabled} />
    </div>
  );
}

function VideoCard({
  video,
  onChange,
  disabled,
}: {
  video: VideoParams;
  onChange: (v: VideoParams) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const copy = video.vcodec === "copy";
  // h264_mf（Media Foundation 硬编）：仅支持码率控制，不支持 CRF/preset/tune/profile/level/pix_fmt/gop 等
  const mf = video.vcodec === "h264_mf";
  const dis = disabled || copy;
  const mfDis = disabled || mf;

  const set = (patch: Partial<VideoParams>) => onChange({ ...video, ...patch });

  const codecGroups = [
    { key: "sw", labelKey: "codecGroup.sw" as const, items: VIDEO_CODECS.filter((c) => c.group === "sw") },
    { key: "hw", labelKey: "codecGroup.hw" as const, items: VIDEO_CODECS.filter((c) => c.group === "hw") },
    { key: "copy", labelKey: "codecGroup.copy" as const, items: VIDEO_CODECS.filter((c) => c.group === "copy") },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {/* 编码器 */}
      <div className="space-y-1.5 sm:col-span-2">
        <Label>{t("video.vcodec")}</Label>
        <Select
          value={video.vcodec}
          onValueChange={(v) => {
            const vc = v as VideoParams["vcodec"];
            // 切到 h264_mf：自动切 ABR 码率模式（不支持 CRF/CBR 的 maxrate/bufsize）
            const patch: Partial<VideoParams> = { vcodec: vc };
            if (vc === "h264_mf" && video.qualityMode !== "abr") {
              patch.qualityMode = "abr";
            }
            set(patch);
          }}
          items={Object.fromEntries(
            codecGroups.flatMap((g) => g.items.map((c) => [c.value, t(c.labelKey as Parameters<typeof t>[0])])),
          )}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {codecGroups.map((g) => (
              <div key={g.key}>
                <div className="px-2 py-1 text-xs text-muted-foreground">{t(g.labelKey)}</div>
                {g.items.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {t(c.labelKey as Parameters<typeof t>[0])}
                  </SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>
        {copy && <p className="text-xs text-muted-foreground">{t("codec.copyHint")}</p>}
        {mf && <p className="text-xs text-muted-foreground">{t("codec.h264MfHint")}</p>}
      </div>

      {/* 质量模式 + CRF（h264_mf 仅支持码率控制，CRF/CBR 不支持 → 置灰） */}
      <div className="space-y-1.5 sm:col-span-2">
        <Label>{t("video.qualityMode")}</Label>
        <div className="flex flex-wrap gap-1.5">
          {QUALITY_MODES.map((m) => (
            <Button
              key={m.value}
              type="button"
              size="sm"
              variant={video.qualityMode === m.value ? "default" : "outline"}
              disabled={dis || (mf && m.value !== "abr")}
              onClick={() => set({ qualityMode: m.value })}
            >
              {t(m.labelKey)}
            </Button>
          ))}
        </div>
      </div>

      <div
        className={cn(
          "sm:col-span-2 space-y-1.5",
          dis && "pointer-events-none opacity-50",
        )}
      >
        {video.qualityMode === "crf" && !mf && (
          <>
            <div className="flex items-center justify-between">
              <Label className="cursor-default">CRF</Label>
              <span className="font-mono text-sm">{video.crf}</span>
            </div>
            <Slider
              min={0}
              max={51}
              step={1}
              value={[video.crf]}
              onValueChange={(value) => {
                const v = Array.isArray(value) ? value[0] : value;
                if (v !== undefined) set({ crf: Math.round(v) });
              }}
              disabled={dis}
            />
            <p className="text-xs text-muted-foreground">{t("quality.crfHint")}</p>
          </>
        )}
        {(video.qualityMode === "abr" || video.qualityMode === "cbr") && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t("quality.bitrate")}</Label>
              <Input
                type="number"
                min={100}
                step={100}
                value={video.bitrateK}
                disabled={dis}
                onChange={(e) => set({ bitrateK: Math.max(0, Number(e.target.value) || 0) })}
              />
            </div>
            {video.qualityMode === "cbr" && !mf && (
              <>
                <div className="space-y-1">
                  <Label>{t("quality.maxrate")}</Label>
                  <Input
                    type="number"
                    min={100}
                    step={100}
                    value={video.maxrateK}
                    disabled={dis}
                    onChange={(e) => set({ maxrateK: Math.max(0, Number(e.target.value) || 0) })}
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label>{t("quality.bufsize")}</Label>
                  <Input
                    type="number"
                    min={100}
                    step={100}
                    value={video.bufsizeK}
                    disabled={dis}
                    onChange={(e) => set({ bufsizeK: Math.max(0, Number(e.target.value) || 0) })}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 基础参数：preset/tune/profile/level/pix_fmt（h264_mf 不支持，禁用）；fps 保留 */}
      <div className="space-y-1.5">
        <Label>{t("video.presetSpeed")}</Label>
        <Select
          value={video.preset}
          onValueChange={(v) => set({ preset: v as VideoParams["preset"] })}
          disabled={mfDis}
          items={Object.fromEntries(X264_PRESETS.map((p) => [p, p]))}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {X264_PRESETS.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>{t("video.tune")}</Label>
        <Select value={video.tune} onValueChange={(v) => set({ tune: v as VideoParams["tune"] })} disabled={mfDis}>
          <SelectTrigger><SelectValue placeholder={t("common.auto")} /></SelectTrigger>
          <SelectContent>
            {TUNES.map((p) => (
              <SelectItem key={p} value={p}>{p || t("common.auto")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>{t("video.profile")}</Label>
        <Select value={video.profile} onValueChange={(v) => v !== null && set({ profile: v })} disabled={mfDis}>
          <SelectTrigger><SelectValue placeholder={t("common.auto")} /></SelectTrigger>
          <SelectContent>
            {PROFILES.map((p) => (
              <SelectItem key={p} value={p}>{p || t("common.auto")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>{t("video.level")}</Label>
        <Select value={video.level} onValueChange={(v) => v !== null && set({ level: v })} disabled={mfDis}>
          <SelectTrigger><SelectValue placeholder={t("common.auto")} /></SelectTrigger>
          <SelectContent>
            {LEVELS.map((p) => (
              <SelectItem key={p} value={p}>{p || t("common.auto")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>{t("video.pixFmt")}</Label>
        <Select value={video.pixFmt} onValueChange={(v) => set({ pixFmt: v as VideoParams["pixFmt"] })} disabled={mfDis}>
          <SelectTrigger><SelectValue placeholder={t("common.auto")} /></SelectTrigger>
          <SelectContent>
            {PIX_FMTS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{t(p.labelKey)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>{t("video.fps")}</Label>
        <Input
          type="number"
          min={0}
          max={240}
          step={1}
          value={video.fps || ""}
          placeholder={t("common.auto")}
          disabled={dis}
          onChange={(e) => set({ fps: Math.max(0, Number(e.target.value) || 0) })}
        />
      </div>

      {/* 分辨率 */}
      <div className="space-y-1.5 sm:col-span-2">
        <Label>{t("video.scale")}</Label>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { v: 0, k: "video.scale.off" as const },
              { v: 1, k: "video.scale.custom" as const },
              { v: 2, k: "video.scale.fitWidth" as const },
            ]
          ).map((m) => (
            <Button
              key={m.v}
              type="button"
              size="sm"
              variant={video.scaleMode === m.v ? "default" : "outline"}
              disabled={dis}
              onClick={() => set({ scaleMode: m.v as VideoParams["scaleMode"] })}
            >
              {t(m.k)}
            </Button>
          ))}
        </div>
        {video.scaleMode === 1 && (
          <div className="mt-2 flex items-center gap-2">
            <Input
              type="number"
              min={16}
              step={2}
              value={video.scaleW || ""}
              placeholder="W"
              disabled={dis}
              onChange={(e) => set({ scaleW: Math.max(0, Number(e.target.value) || 0) })}
            />
            <span className="text-muted-foreground">×</span>
            <Input
              type="number"
              min={16}
              step={2}
              value={video.scaleH || ""}
              placeholder="H"
              disabled={dis}
              onChange={(e) => set({ scaleH: Math.max(0, Number(e.target.value) || 0) })}
            />
          </div>
        )}
        {video.scaleMode === 2 && (
          <div className="mt-2">
            <Input
              type="number"
              min={16}
              step={2}
              value={video.scaleWidth || ""}
              placeholder="1280"
              disabled={dis}
              onChange={(e) => set({ scaleWidth: Math.max(0, Number(e.target.value) || 0) })}
            />
          </div>
        )}
      </div>

      {/* 高级参数 */}
      <Collapsible className="sm:col-span-2">
        <CollapsibleTrigger className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
          <ChevronDown className="size-4" />
          {t("video.advanced")}
        </CollapsibleTrigger>
        <CollapsibleContent className="grid grid-cols-2 gap-3 pt-2">
          <div className="space-y-1">
            <Label>{t("video.gop")}</Label>
            <Input
              type="number"
              min={0}
              step={10}
              value={video.gop || ""}
              placeholder={t("common.auto")}
              disabled={mfDis}
              onChange={(e) => set({ gop: Math.max(0, Number(e.target.value) || 0) })}
            />
          </div>
          <div className="space-y-1">
            <Label>{t("video.bframes")}</Label>
            <Input
              type="number"
              min={-1}
              value={video.bframes}
              disabled={mfDis}
              onChange={(e) => set({ bframes: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label>{t("video.refs")}</Label>
            <Input
              type="number"
              min={0}
              value={video.refs || ""}
              placeholder={t("common.auto")}
              disabled={mfDis}
              onChange={(e) => set({ refs: Math.max(0, Number(e.target.value) || 0) })}
            />
          </div>
          <div className="flex items-end gap-2 pb-1">
            <Checkbox
              id="sc-threshold"
              checked={video.scThreshold}
              disabled={mfDis}
              onCheckedChange={(c) => set({ scThreshold: !!c })}
            />
            <label htmlFor="sc-threshold" className="text-sm">{t("video.scThreshold")}</label>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function AudioCard({
  audio,
  onChange,
  disabled,
}: {
  audio: VideoAudioParams;
  onChange: (a: VideoAudioParams) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const copy = audio.acodec === "copy";
  const dis = disabled || copy;
  const set = (patch: Partial<VideoAudioParams>) => onChange({ ...audio, ...patch });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>{t("video.audioCodec")}</Label>
        <Select
          value={audio.acodec}
          onValueChange={(v) => set({ acodec: v as VideoAudioParams["acodec"] })}
          items={Object.fromEntries(AUDIO_CODECS.map((c) => [c.value, t(c.labelKey)]))}
        >
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {AUDIO_CODECS.map((c) => (
              <SelectItem key={c.value} value={c.value}>{t(c.labelKey)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>{t("video.audioBitrate")}</Label>
        <Input
          type="number"
          min={0}
          step={8}
          value={audio.bitrateK || ""}
          placeholder={t("common.auto")}
          disabled={dis}
          onChange={(e) => set({ bitrateK: Math.max(0, Number(e.target.value) || 0) })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>{t("video.sampleRate")}</Label>
        <Select
          value={String(audio.sampleRate || 0)}
          onValueChange={(v) => set({ sampleRate: Number(v) })}
          disabled={dis}
          items={{ "0": t("common.auto"), ...Object.fromEntries([8000, 11025, 16000, 22050, 32000, 44100, 48000, 88200, 96000, 176400, 192000].map((r) => [String(r), `${r} Hz`])) }}
        >
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="0">{t("common.auto")}</SelectItem>
            {[8000, 11025, 16000, 22050, 32000, 44100, 48000, 88200, 96000, 176400, 192000].map((r) => (
              <SelectItem key={r} value={String(r)}>{r} Hz</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>{t("video.channels")}</Label>
        <Select
          value={String(audio.channels || 0)}
          onValueChange={(v) => set({ channels: Number(v) })}
          disabled={dis}
          items={{
            "0": t("video.channels.auto"), "1": t("video.channels.mono"), "2": t("video.channels.stereo"),
            "6": t("video.channels.51"), "8": t("video.channels.71"),
          }}
        >
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
  );
}