import { useCallback, useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Copy, Download, Pencil, FileVideo } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { useTasks } from "@/tasks/TaskProvider";
import { api } from "@/lib/tauri";
import { FileRow } from "@/components/shared/FileRow";
import { basename, formatMs } from "@/lib/format";
import type { MediaFullInfo } from "@/types";

type InfoTab = "format" | "video" | "audio";

function fmtSize(bytes: number): string {
  const kb = bytes / 1024;
  const mb = kb / 1024;
  return mb >= 1 ? `${mb.toFixed(2)} MB` : kb >= 1 ? `${kb.toFixed(1)} KB` : `${bytes} B`;
}

function fmtBitrate(kbps: number | null): string {
  if (!kbps) return "—";
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${kbps} kbps`;
}

function fmtFps(rate: string): string {
  if (!rate || rate === "0/0") return "—";
  const parts = rate.split("/");
  if (parts.length === 2) {
    const n = Number(parts[0]), d = Number(parts[1]);
    if (d > 0) return (n / d).toFixed(2);
  }
  return rate;
}

/** 媒体信息页（PRD 5.1-5.4） */
export function MediaInfoPage() {
  const { t } = useI18n();
  const { addTask } = useTasks();

  const [input, setInput] = useState("");
  const [info, setInfo] = useState<MediaFullInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<InfoTab>("format");
  const [videoIdx, setVideoIdx] = useState(0);
  const [audioIdx, setAudioIdx] = useState(0);
  const [metaOpen, setMetaOpen] = useState(false);
  const [metaEdit, setMetaEdit] = useState<Record<string, string>>({});

  /** 选文件 → 全量探测 */
  const pickInput = useCallback(async () => {
    const picked = await open({
      multiple: false,
      directory: false,
      title: t("info.input"),
      filters: [{ name: "Media", extensions: ["*"] }],
    });
    if (typeof picked !== "string" || !picked) return;
    setInput(picked);
    setLoading(true);
    try {
      const full = await api.mediaProbeFull(picked);
      setInfo(full);
      setVideoIdx(0);
      setAudioIdx(0);
      setMetaEdit({ ...full.metadata });
      setTab("format");
    } catch (e) {
      console.error(e);
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const currentVideo = useMemo(
    () => (info?.videoStreams ?? [])[videoIdx] ?? null,
    [info, videoIdx],
  );
  const currentAudio = useMemo(
    () => (info?.audioStreams ?? [])[audioIdx] ?? null,
    [info, audioIdx],
  );

  /** 导出全部信息为 JSON/TXT */
  const exportInfo = async (format: "json" | "txt") => {
    if (!info) return;
    const content = format === "json" ? JSON.stringify(info, null, 2) : formatText(info);
    const ext = format === "json" ? "json" : "txt";
    const path = await save({
      title: t("common.export"),
      defaultPath: `${input.replace(/\.[^.]+$/, "")}.${ext}`,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    if (typeof path === "string" && path) {
      try {
        await api.writeTextFile(path, content);
        toast.success(t("common.done"));
      } catch (e) {
        toast.error(String(e));
      }
    }
  };

  /** 一键复制全部文本 */
  const copyAll = () => {
    if (!info) return;
    const text = formatText(info);
    void navigator.clipboard.writeText(text);
    toast.success(t("common.done"));
  };

  /** 元数据编辑 → 生成 copy 任务入队 */
  const saveMetadata = () => {
    if (!input || !info) return;
    const out = insertSuffix(input, "_edited");
    const args: string[] = ["-i", input];
    for (const [k, v] of Object.entries(metaEdit)) {
      if (v && v !== info.metadata[k]) args.push("-metadata", `${k}=${v}`);
    }
    args.push("-c", "copy", out);
    void addTask({
      name: `${basename(input)} → ${basename(out)}`,
      args,
      inputPath: input,
      outputPath: out,
    });
    setMetaOpen(false);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-5 p-6">
        <div>
          <h1 className="text-xl font-semibold">{t("info.title")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("info.desc")}</p>
        </div>

        <FileRow label={t("info.input")} value={input} onBrowse={() => void pickInput()} readOnly />
        {loading && <p className="text-sm text-muted-foreground">{t("video.loadingInfo")}</p>}

        {info?.ok && (
          <>
            {/* Tab 切换 */}
            <div className="flex items-center gap-2 pb-2">
              {(["format", "video", "audio"] as const).map((k) => (
                <Button key={k} type="button" size="sm" variant={tab === k ? "default" : "outline"} onClick={() => setTab(k)}>
                  {t(`info.tab.${k}`)}
                </Button>
              ))}
              <div className="ml-auto flex gap-1">
                <Button variant="outline" size="sm" onClick={copyAll}><Copy className="size-3.5" />{t("common.copy")}</Button>
                <Button variant="outline" size="sm" onClick={() => void exportInfo("json")}><Download className="size-3.5" />JSON</Button>
                <Button variant="outline" size="sm" onClick={() => void exportInfo("txt")}><Download className="size-3.5" />TXT</Button>
              </div>
            </div>

            {tab === "format" && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileVideo className="size-4" />
                    {t("info.tab.format")}
                    <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={() => { setMetaEdit({ ...info.metadata }); setMetaOpen(true); }}>
                      <Pencil className="size-3.5" />{t("info.editMeta")}
                    </Button>
                  </CardTitle>
                  <CardDescription />
                </CardHeader>
                <CardContent>
                  <InfoTable rows={[
                    [t("info.formatName"), info.format.formatLongName],
                    [t("info.duration"), formatMs(Math.round(info.format.duration * 1000))],
                    [t("info.fileSize"), fmtSize(info.format.size)],
                    [t("info.bitrate"), fmtBitrate(info.format.bitRate ? Math.round(info.format.bitRate / 1000) : null)],
                    [t("info.nbStreams"), String(info.format.nbStreams)],
                    [t("info.filename"), info.format.filename],
                    [t("info.startTime"), formatMs(Math.round(info.format.startTime * 1000))],
                  ]} />
                  <Separator className="my-3" />
                  <h4 className="mb-2 text-sm font-medium">{t("info.metadata")}</h4>
                  {Object.keys(info.metadata).length > 0 ? (
                    <InfoTable rows={Object.entries(info.metadata).map(([k, v]) => [k, v])} />
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("info.noMeta")}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {tab === "video" && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t("info.tab.video")}</CardTitle>
                  <CardDescription />
                </CardHeader>
                <CardContent className="space-y-4">
                  {info.videoStreams.length === 0 && <p className="text-sm text-muted-foreground">{t("info.noVideo")}</p>}
                  {info.videoStreams.length > 1 && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">{t("info.track")}</Label>
                      <Select value={String(videoIdx)} onValueChange={(v) => v !== null && setVideoIdx(Number(v))}>
                        <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {info.videoStreams.map((s, i) => (
                            <SelectItem key={i} value={String(i)}>#{i} {s.codecName} {s.width}×{s.height}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {currentVideo && (
                    <InfoTable rows={[
                      [t("info.codec"), `${currentVideo.codecName} (${currentVideo.codecLongName})`],
                      [t("info.profile"), currentVideo.profile],
                      [t("info.level"), String(currentVideo.level)],
                      [t("info.resolution"), `${currentVideo.width} × ${currentVideo.height}`],
                      [t("info.codedResolution"), `${currentVideo.codedWidth} × ${currentVideo.codedHeight}`],
                      [t("info.pixFmt"), currentVideo.pixFmt],
                      [t("info.bitDepth"), currentVideo.bitsPerRawSample !== null ? String(currentVideo.bitsPerRawSample) : "—"],
                      [t("info.colorSpace"), currentVideo.colorSpace || "—"],
                      [t("info.colorPrimaries"), currentVideo.colorPrimaries || "—"],
                      [t("info.colorTransfer"), currentVideo.colorTransfer || "—"],
                      [t("info.chroma"), currentVideo.chromaLocation || "—"],
                      [t("info.fps"), fmtFps(currentVideo.avgFrameRate)],
                      [t("info.bitrate"), fmtBitrate(currentVideo.bitRate ? Math.round(currentVideo.bitRate / 1000) : null)],
                      [t("info.nbFrames"), currentVideo.nbFrames !== null ? String(currentVideo.nbFrames) : "—"],
                      [t("info.hasBFrames"), String(currentVideo.hasBFrames)],
                      [t("info.refs"), String(currentVideo.refs)],
                      [t("info.sar"), currentVideo.sampleAspectRatio || "—"],
                      [t("info.dar"), currentVideo.displayAspectRatio || "—"],
                      [t("info.fieldOrder"), currentVideo.fieldOrder],
                      [t("info.duration"), formatMs(Math.round(currentVideo.duration * 1000))],
                    ]} />
                  )}
                </CardContent>
              </Card>
            )}

            {tab === "audio" && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t("info.tab.audio")}</CardTitle>
                  <CardDescription />
                </CardHeader>
                <CardContent className="space-y-4">
                  {info.audioStreams.length === 0 && <p className="text-sm text-muted-foreground">{t("info.noAudio")}</p>}
                  {info.audioStreams.length > 1 && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">{t("info.track")}</Label>
                      <Select value={String(audioIdx)} onValueChange={(v) => v !== null && setAudioIdx(Number(v))}>
                        <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {info.audioStreams.map((s, i) => (
                            <SelectItem key={i} value={String(i)}>#{i} {s.codecName} {s.sampleRate}Hz</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {currentAudio && (
                    <InfoTable rows={[
                      [t("info.codec"), `${currentAudio.codecName} (${currentAudio.codecLongName})`],
                      [t("info.profile"), currentAudio.profile],
                      [t("info.sampleRate"), `${currentAudio.sampleRate} Hz`],
                      [t("info.channels"), `${currentAudio.channels} (${currentAudio.channelLayout})`],
                      [t("info.sampleFmt"), currentAudio.sampleFmt],
                      [t("info.bitDepth"), String(currentAudio.bitsPerSample)],
                      [t("info.bitrate"), fmtBitrate(currentAudio.bitRate ? Math.round(currentAudio.bitRate / 1000) : null)],
                      [t("info.maxBitrate"), fmtBitrate(currentAudio.maxBitRate ? Math.round(currentAudio.maxBitRate / 1000) : null)],
                      [t("info.nbFrames"), currentAudio.nbFrames !== null ? String(currentAudio.nbFrames) : "—"],
                      [t("info.duration"), formatMs(Math.round(currentAudio.duration * 1000))],
                    ]} />
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}

        {info && !info.ok && (
          <Card>
            <CardContent className="p-6 text-sm text-destructive">
              {info.error ?? t("error.probeFailed")}
            </CardContent>
          </Card>
        )}
      </div>

      {/* 元数据编辑弹窗 */}
      <Dialog open={metaOpen} onOpenChange={setMetaOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("info.editMeta")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {(META_FIELDS).map((f) => (
              <div key={f.key} className="space-y-1">
                <Label className="text-xs">{f.label}</Label>
                <Input
                  value={metaEdit[f.key] ?? ""}
                  placeholder={f.label}
                  onChange={(e) => setMetaEdit({ ...metaEdit, [f.key]: e.target.value })}
                />
              </div>
            ))}
            {/* 未知元数据也展示 */}
            {Object.entries(metaEdit)
              .filter(([k]) => !META_FIELDS.some((f) => f.key === k))
              .map(([k, v]) => (
                <div key={k} className="space-y-1">
                  <Label className="text-xs">{k}</Label>
                  <Input value={v} onChange={(e) => setMetaEdit({ ...metaEdit, [k]: e.target.value })} />
                </div>
              ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMetaOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={saveMetadata}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const META_FIELDS = [
  { key: "title", label: "Title" },
  { key: "artist", label: "Artist" },
  { key: "album", label: "Album" },
  { key: "genre", label: "Genre" },
  { key: "comment", label: "Comment" },
  { key: "date", label: "Date" },
  { key: "description", label: "Description" },
  { key: "synopsis", label: "Synopsis" },
  { key: "copyright", label: "Copyright" },
];

/** 多行信息表格 */
function InfoTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="divide-y divide-border text-sm">
      {rows.filter(([, v]) => v && v !== "0" && v !== "0:00" && v !== "—").map(([k, v], i) => (
        <div key={i} className="flex gap-4 py-2">
          <span className="w-1/3 shrink-0 text-muted-foreground">{k}</span>
          <span className="break-all font-mono text-xs">{String(v)}</span>
        </div>
      ))}
    </div>
  );
}

/** 格式化全量文本（用于复制/导出 TXT） */
function formatText(info: MediaFullInfo): string {
  const lines: string[] = [];
  lines.push(`=== ${info.format.formatLongName} ===`);
  lines.push(`File: ${info.format.filename}`);
  lines.push(`Duration: ${formatMs(Math.round(info.format.duration * 1000))}`);
  lines.push(`Size: ${fmtSize(info.format.size)}`);
  if (info.format.bitRate) lines.push(`Bitrate: ${fmtBitrate(Math.round(info.format.bitRate / 1000))}`);
  lines.push("");
  for (const vs of info.videoStreams) {
    lines.push(`--- Video Stream #${vs.index} ---`);
    lines.push(`Codec: ${vs.codecName} (${vs.codecLongName})`);
    lines.push(`Resolution: ${vs.width}x${vs.height}, Pixel Format: ${vs.pixFmt}`);
    lines.push(`FPS: ${fmtFps(vs.avgFrameRate)}, Duration: ${formatMs(Math.round(vs.duration * 1000))}`);
    lines.push(`Profile: ${vs.profile}, Level: ${vs.level}, B-Frames: ${vs.hasBFrames}, Refs: ${vs.refs}`);
    if (vs.bitRate) lines.push(`Bitrate: ${fmtBitrate(Math.round(vs.bitRate / 1000))}`);
    lines.push("");
  }
  for (const as of info.audioStreams) {
    lines.push(`--- Audio Stream #${as.index} ---`);
    lines.push(`Codec: ${as.codecName} (${as.codecLongName})`);
    lines.push(`Sample Rate: ${as.sampleRate} Hz, Channels: ${as.channels} (${as.channelLayout})`);
    lines.push(`Sample Format: ${as.sampleFmt}, Profile: ${as.profile}`);
    if (as.bitRate) lines.push(`Bitrate: ${fmtBitrate(Math.round(as.bitRate / 1000))}`);
    lines.push("");
  }
  if (Object.keys(info.metadata).length > 0) {
    lines.push(`--- Metadata ---`);
    for (const [k, v] of Object.entries(info.metadata)) lines.push(`${k}: ${v}`);
  }
  return lines.join("\n");
}

/** 在扩展名前插入后缀：file.mp3 + "_01" → file_01.mp3 */
function insertSuffix(path: string, suffix: string): string {
  const dot = path.lastIndexOf(".");
  const slash = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  if (dot > slash) return path.slice(0, dot) + suffix + path.slice(dot);
  return path + suffix;
}

