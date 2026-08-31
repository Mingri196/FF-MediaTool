import { ArrowLeft, GitBranch, Scale, Sparkles } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";

export const GITHUB_URL = "https://github.com/Mingri196/FF-MediaTool";
export const MIT_LICENSE_URL = "https://github.com/Mingri196/FF-MediaTool?tab=MIT-1-ov-file";
export const APP_VERSION = "v0.87 Beta";

/**
 * 关于详情页：
 * - 从设置页「跳转至详细页」进入；入场/返回滑动动画由外层 PageStack 驱动
 *   （本页不做自身 transform，避免与父层动画叠加冲突）。
 * - 底层自定义背景保持在 AppShell 层不动；板块透明度 CSS 选择器天然命中卡片。
 * - 返回：onBack 由父层切换路由，PageStack 让本页向右滑出。
 */
export function AboutPage({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();

  const openRepo = () => void openUrl(GITHUB_URL).catch((e) => console.error(e));
  const openMitLicense = () => void openUrl(MIT_LICENSE_URL).catch((e) => console.error(e));

  return (
    <div data-testid="about-page" className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 p-6">
        {/* 返回按钮 */}
        <div>
          <Button type="button" variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="size-4" />
            {t("about.back")}
          </Button>
        </div>

        {/* 软件大标题 + 版本 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Sparkles className="size-5 text-primary" />
              FF-MediaTool
              <Badge variant="outline">{APP_VERSION}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>{t("about.stackLine")}</p>
            <p>{t("about.versionLine", { version: APP_VERSION })}</p>
          </CardContent>
        </Card>

        {/* GitHub 仓库 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <GitBranch className="size-4" />
              {t("about.repo")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <button
              type="button"
              data-testid="about-repo-link"
              onClick={openRepo}
              className="rounded-md px-1 font-mono text-xs text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:decoration-primary"
            >
              {GITHUB_URL}
            </button>
          </CardContent>
        </Card>

        {/* MIT 许可证 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Scale className="size-4" />
              MIT License
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("about.mitDesc")}</p>
            <Button type="button" variant="outline" size="sm" data-testid="about-mit-link" onClick={openMitLicense}>
              {t("about.mitFull")}
            </Button>
          </CardContent>
        </Card>

        {/* 功能简述 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("about.features")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">
              {t("about.featuresDesc")}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}