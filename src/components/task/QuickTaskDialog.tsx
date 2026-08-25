import { useMemo, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { FolderOpen, FileVideo } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { useSettings } from "@/settings/SettingsProvider";
import { api } from "@/lib/tauri";
import { deriveOutputPath, basename } from "@/lib/format";
import type { NewTask } from "@/tasks/types";

interface Profile {
  ext: string;
  args: string[];
  labelKey:
    | "quick.profile.mp4"
    | "quick.profile.mkv"
    | "quick.profile.webm"
    | "quick.profile.mp3"
    | "quick.profile.flac"
    | "quick.profile.copy";
}

const PROFILES: Profile[] = [
  {
    ext: "mp4",
    args: ["-c:v", "libx264", "-preset", "medium", "-crf", "23", "-c:a", "aac", "-b:a", "128k"],
    labelKey: "quick.profile.mp4",
  },
  {
    ext: "mkv",
    args: ["-c:v", "libx264", "-preset", "medium", "-crf", "23", "-c:a", "aac", "-b:a", "128k"],
    labelKey: "quick.profile.mkv",
  },
  {
    ext: "webm",
    args: ["-c:v", "libvpx-vp9", "-crf", "31", "-b:v", "0", "-c:a", "libopus", "-b:a", "128k"],
    labelKey: "quick.profile.webm",
  },
  {
    ext: "mp3",
    args: ["-vn", "-c:a", "libmp3lame", "-b:a", "192k"],
    labelKey: "quick.profile.mp3",
  },
  {
    ext: "flac",
    args: ["-vn", "-c:a", "flac"],
    labelKey: "quick.profile.flac",
  },
  {
    ext: "mkv",
    args: ["-c", "copy"],
    labelKey: "quick.profile.copy",
  },
];

/**
 * 快速任务对话框：选择输入文件 → 选处理方式 → 自动生成输出路径（可改）→ 入队。
 * 模块二用于驱动真实 ffmpeg 任务验证完整链路；模块三/四将替换为完整参数面板。
 */
export function QuickTaskDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (task: NewTask) => void;
}) {
  const { t } = useI18n();
  const { settings } = useSettings();
  const [input, setInput] = useState<string | null>(null);
  const [profileIdx, setProfileIdx] = useState(0);
  const [output, setOutput] = useState("");

  const profile = PROFILES[profileIdx];

  // 输入或处理方式变化时自动重新生成输出路径（使用默认输出路径）
  const [outputTouched, setOutputTouched] = useState(false);
  const refreshOutput = async (inp: string | null, idx: number) => {
    setOutputTouched(false);
    if (!inp) return setOutput("");
    const cfgDir = settings?.outputPaths?.quickTask || (await api.getOptDir());
    const baseInput = cfgDir + "/" + basename(inp);
    setOutput(deriveOutputPath(baseInput, PROFILES[idx].ext));
  };

  const pickInput = async () => {
    const picked = await openDialog({
      multiple: false,
      directory: false,
      title: t("quick.input"),
    });
    if (typeof picked === "string" && picked) {
      setInput(picked);
      refreshOutput(picked, profileIdx);
      // 记录最近输入目录（App 层监听后写入设置）
      const dir = picked.replace(/[\\/][^\\/]+$/, "");
      window.dispatchEvent(new CustomEvent("ffmt:last-input-dir", { detail: dir }));
    }
  };

  const submit = () => {
    if (!input) return void toast.error(t("quick.errorNoInput"));
    if (!output) return void toast.error(t("quick.errorNoOutput"));
    const name = `${basename(input)} → ${basename(output)}`;
    onAdd({
      name,
      args: ["-i", input, ...profile.args, output],
      inputPath: input,
      outputPath: output,
    });
    setInput(null);
    setOutput("");
    setOutputTouched(false);
    onOpenChange(false);
  };

  const outputHint = useMemo(
    () => (outputTouched ? "" : t("quick.autoOutput")),
    [outputTouched, t],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t("quick.title")}</DialogTitle>
          <DialogDescription>{t("quick.desc")}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0">
          {/* 输入文件 */}
          <div className="space-y-1.5">
            <Label>{t("quick.input")}</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={input ?? ""}
                placeholder={t("quick.inputPlaceholder")}
                className="flex-1 font-mono text-xs"
                onClick={() => void pickInput()}
              />
              <Button variant="outline" size="icon" onClick={() => void pickInput()} title={t("quick.browseInput")}>
                <FolderOpen className="size-4" />
              </Button>
            </div>
          </div>

          {/* 处理方式 */}
          <div className="space-y-1.5">
            <Label>{t("quick.profile")}</Label>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {PROFILES.map((p, i) => (
                <Button
                  key={i}
                  type="button"
                  variant={profileIdx === i ? "default" : "outline"}
                  size="sm"
                  className="justify-start h-auto min-h-[2.25rem] whitespace-normal text-left"
                  onClick={() => {
                    setProfileIdx(i);
                    refreshOutput(input, i);
                  }}
                >
                  <FileVideo className="size-3.5 shrink-0 mt-0.5" />
                  <span className="break-words">{t(p.labelKey)}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* 输出文件 */}
          <div className="space-y-1.5">
            <Label>{t("quick.output")}</Label>
            <div className="flex gap-2">
              <Input
                value={output}
                placeholder="out.mp4"
                className="flex-1 font-mono text-xs"
                onChange={(e) => {
                  setOutput(e.target.value);
                  setOutputTouched(true);
                }}
              />
            </div>
            {outputHint && <p className="text-xs text-muted-foreground">{outputHint}</p>}
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border pt-3 mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={!input || !output}>
            {t("quick.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}