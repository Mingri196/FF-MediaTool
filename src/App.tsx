import { useEffect, useMemo, useState } from "react";
import { Toaster } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { SettingsPage } from "@/pages/SettingsPage";
import { PlaceholderPage } from "@/pages/PlaceholderPage";
import { FirstRunDialog } from "@/components/ffmpeg/FirstRunDialog";
import { I18nProvider, useI18n } from "@/i18n";
import { SettingsProvider, useSettings } from "@/settings/SettingsProvider";
import { applyAccent, applyThemeMode } from "@/theme/theme";
import { api } from "@/lib/tauri";
import type { Language, PageId } from "@/types";

function Shell() {
  const { settings, update } = useSettings();
  const [page, setPage] = useState<PageId>("settings");
  const [showFirstRun, setShowFirstRun] = useState(false);

  // 应用主题模式 + 强调色（跟随设置实时生效）
  const themeMode = settings?.theme ?? "system";
  const accent = settings?.accentColor ?? "#4f46e5";
  useEffect(() => applyThemeMode(themeMode), [themeMode]);
  useEffect(() => {
    applyAccent(accent);
  }, [accent]);

  // 设置加载完成后：检测 FFmpeg，判断是否需要首次引导
  useEffect(() => {
    if (!settings) return;
    let cancelled = false;
    api
      .detectFfmpeg()
      .then((s) => {
        if (cancelled) return;
        if (!s.ffmpeg && !settings.hasCompletedFirstRun) {
          setShowFirstRun(true);
        }
      })
      .catch((e) => console.error("FFmpeg 检测失败", e));
    return () => {
      cancelled = true;
    };
    // 只在首次引导标记变化时重跑（检测本身轻量）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.hasCompletedFirstRun]);

  const handleFirstRunDone = () => {
    setShowFirstRun(false);
    update({ hasCompletedFirstRun: true });
  };

  const main = useMemo(() => {
    if (page === "settings") return <SettingsPage />;
    return <PlaceholderPage />;
  }, [page]);

  return (
    <>
      <AppShell page={page} onNavigate={setPage}>
        {main}
      </AppShell>
      <FirstRunDialog
        show={showFirstRun}
        onDone={handleFirstRunDone}
        onConfigured={() => setShowFirstRun(false)}
      />
    </>
  );
}

/** 等设置加载完成后再渲染应用；并把 settings.language 同步给 I18nProvider */
function Inner() {
  const { settings, loading } = useSettings();
  const { setLang } = useI18n();

  // settings.language 是语言的唯一真理源（切换入口在设置页下拉，写入 settings）
  useEffect(() => {
    if (settings) setLang(settings.language);
  }, [settings?.language, setLang]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !settings) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-sm text-muted-foreground">
        FF-MediaTool
      </div>
    );
  }
  return (
    <>
      <Shell />
      <Toaster position="bottom-right" richColors closeButton />
    </>
  );
}

function Root() {
  // 语言状态上提：I18nProvider 在最外层（SettingsProvider 内部需要 t 函数做错误提示），
  // 初值 zh，设置加载后由 Inner 同步为持久化语言。
  const [lang, setLang] = useState<Language>("zh");
  return (
    <I18nProvider lang={lang} setLang={setLang}>
      <SettingsProvider>
        <Inner />
      </SettingsProvider>
    </I18nProvider>
  );
}

export default Root;