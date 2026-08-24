import { useMemo, useState } from "react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
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
  const [input, setInput] = useState<string | null>(null);
  const [profileIdx, setProfileIdx] = useState(0);
  const [output, setOutput] = useState("");

  const profile = PROFILES[profileIdx];

  // 输入或处理方式变化时自动重新生成输出路径（若用户未手动改过）
  const [outputTouched, setOutputTouched] = useState(false);
  const refreshOutput = (inp: string | null, idx: number) => {
    setOutputTouched(false);
    if (!inp) return setOutput("");
    setOutput(deriveOutputPath(inp, PROFILES[idx].ext));
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

  const pickOutput = async () => {
    const picked = await saveDialog({
      title: t("quick.output"),
      defaultPath: output || undefined,
    });
    if (typeof picked === "string" && picked) {
      setOutput(picked);
      setOutputTouched(true);
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("quick.title")}</DialogTitle>
          <DialogDescription>{t("quick.desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
                  className="justify-start"
                  onClick={() => {
                    setProfileIdx(i);
                    refreshOutput(input, i);
                  }}
                >
                  <FileVideo className="size-3.5 shrink-0" />
                  <span className="truncate">{t(p.labelKey)}</span>
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
              <Button variant="outline" size="icon" onClick={() => void pickOutput()} title={t("quick.browseOutput")}>
                <FolderOpen className="size-4" />
              </Button>
            </div>
            {outputHint && <p className="text-xs text-muted-foreground">{outputHint}</p>}
          </div>
        </div>

        <DialogFooter>
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