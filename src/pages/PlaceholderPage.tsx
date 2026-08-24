import { Hammer } from "lucide-react";
import { useI18n } from "@/i18n";

/** 未实现功能页面的占位（模块二~五逐步替换为真实页面） */
export function PlaceholderPage() {
  const { t } = useI18n();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <Hammer className="size-10 opacity-40" />
      <p className="text-base font-medium">{t("page.comingSoon.title")}</p>
      <p className="max-w-sm text-center text-sm">{t("page.comingSoon.desc")}</p>
    </div>
  );
}