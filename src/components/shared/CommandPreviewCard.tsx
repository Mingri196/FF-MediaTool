import { Play, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { useI18n } from "@/i18n";

export interface CommandPreviewCardProps {
  /** 命令文本（可编辑） */
  value: string;
  /** 用户编辑回调 */
  onEdit: (v: string) => void;
  /** 开始处理按钮文案 key */
  startLabelKey: string;
  /** 开始处理 */
  onStart: () => void;
  startDisabled?: boolean;
  /** 复制命令 */
  onCopy: () => void;
  copyDisabled?: boolean;
  /** 覆盖确认弹窗 */
  overwriteOpen: boolean;
  overwriteText: string;
  onConfirmOverwrite: () => void;
  onCancelOverwrite: () => void;
  /** 尚未生成命令（显示占位） */
  empty?: boolean;
  /** 空态（无可用输入）时的提示文字；置灰运行按钮并显示原因 */
  emptyText?: string;
}

/**
 * 命令预览卡片（四模块共用）：
 * - 固定标题「命令预览」
 * - 可编辑多行 textarea，支持滚动/全选/复制/手动修改
 * - 开始处理 + 复制命令
 * - 用户编辑过命令后 UI 参数变化 → 覆盖确认弹窗
 */
export function CommandPreviewCard({
  value,
  onEdit,
  startLabelKey,
  onStart,
  startDisabled,
  onCopy,
  copyDisabled,
  overwriteOpen,
  overwriteText,
  onConfirmOverwrite,
  onCancelOverwrite,
  empty,
  emptyText,
}: CommandPreviewCardProps) {
  const { t } = useI18n();
  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-bold">{t("cmd.preview")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            value={value}
            onChange={(e) => onEdit(e.target.value)}
            placeholder={t("cmd.previewHint")}
            spellCheck={false}
            className="max-h-48 min-h-24 w-full resize-y rounded-md border border-border bg-muted/40 p-3 font-mono text-xs leading-5 text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-ring focus:ring-1 focus:ring-ring"
          />
          <div className="flex items-center gap-2">
            <Button onClick={onStart} disabled={startDisabled ?? empty}>
              <Play className="size-4" />
              {t(startLabelKey as never)}
            </Button>
            <Button
              variant="outline"
              disabled={copyDisabled ?? empty}
              onClick={onCopy}
            >
              <Copy className="size-4" />
              {t("cmd.copy")}
            </Button>
          </div>
          {emptyText && (
            <p className="text-xs text-muted-foreground">{emptyText}</p>
          )}
        </CardContent>
      </Card>

      {/* 覆盖确认弹窗 */}
      <AlertDialog open={overwriteOpen} onOpenChange={(o) => !o && onCancelOverwrite()}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cmd.overwriteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("cmd.overwriteDesc")}</AlertDialogDescription>
            {overwriteText && (
              <pre className="mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap break-all rounded-md bg-muted/60 p-2 font-mono text-[11px] leading-4 text-muted-foreground">
                {overwriteText}
              </pre>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* Close 组件点击会自动触发 onOpenChange(false) → onCancelOverwrite，无需显式 onClick */}
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmOverwrite}>
              {t("cmd.overwriteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
