import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toaster } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { SettingsPage } from "@/pages/SettingsPage";
import { AboutPage } from "@/pages/AboutPage";
import { BatchPage } from "@/pages/BatchPage";
import { VideoConvertPage } from "@/pages/VideoConvertPage";
import { VideoClipPage } from "@/pages/VideoClipPage";
import { AudioConvertPage } from "@/pages/AudioConvertPage";
import { MediaInfoPage } from "@/pages/MediaInfoPage";
import { ImageConvertPage } from "@/pages/ImageConvertPage";
import { ToolsPage } from "@/pages/ToolsPage";
import { FirstRunDialog } from "@/components/ffmpeg/FirstRunDialog";
import { I18nProvider, useI18n } from "@/i18n";
import { SettingsProvider, useSettings } from "@/settings/SettingsProvider";
import { TaskProvider } from "@/tasks/TaskProvider";
import { TabManagerProvider, useTabManager } from "@/tabs/TabManager";
import { applyAccent, applyThemeMode } from "@/theme/theme";
import { api } from "@/lib/tauri";
import type { Language, PageId } from "@/types";

function Shell() {
  const { settings, update } = useSettings();
  const { tabs, activeId, setTabPage } = useTabManager();
  // 当前激活标签的页面（侧边栏高亮 / 内容区渲染）
  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const page: PageId = activeTab?.pageId ?? "settings";
  // navigate 用 ref 读最新 activeId：renderPage 被 useMemo([]) 缓存，
  // 若直接把 activeId 闭包进 navigate，切换标签后 Settings 的 onOpenAbout 会导航到旧标签
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const navigate = useCallback(
    (p: PageId) => {
      setTabPage(activeIdRef.current, p);
    },
    [setTabPage],
  );
  const [showFirstRun, setShowFirstRun] = useState(false);

  // 应用主题模式 + 强调色（跟随设置实时生效）
  const themeMode = settings?.theme ?? "system";
  const accent = settings?.accentColor ?? "#4f46e5";
  useEffect(() => applyThemeMode(themeMode), [themeMode]);
  useEffect(() => {
    applyAccent(accent);
  }, [accent]);

  // 设置加载完成后：仅首次启动检测 FFmpeg，检测结果自动保存
    useEffect(() => {
      if (!settings) return;
      // 如果已完成首次引导，不再检测
      if (settings.hasCompletedFirstRun) return;
      let cancelled = false;
      api
        .detectFfmpeg()
        .then((s) => {
          if (cancelled) return;
          // 标记首次引导完成并保存检测到的路径
                    update({
                      hasCompletedFirstRun: true,
                      ffmpegPath: s.ffmpeg?.path ?? null,
                      ffprobePath: s.ffprobe?.path ?? null,
                    });
          if (!s.ffmpeg) {
            setShowFirstRun(true);
          }
        })
        .catch((e) => console.error("FFmpeg 检测失败", e));
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settings?.hasCompletedFirstRun]);

  // 记录最近输入目录（快速任务对话框派发的事件）
  useEffect(() => {
    const handler = (e: Event) => {
      const dir = (e as CustomEvent<string>).detail;
      if (dir && settings && dir !== settings.lastInputDir) {
        update({ lastInputDir: dir });
      }
    };
    window.addEventListener("ffmt:last-input-dir", handler);
    return () => window.removeEventListener("ffmt:last-input-dir", handler);
  }, [settings, update]);

  const handleFirstRunDone = () => {
    setShowFirstRun(false);
    update({ hasCompletedFirstRun: true });
  };

  // 按页面 id 渲染页面（PageStack 按需调用并缓存；about 返回即回设置页）
  const renderPage = useMemo(() => (id: PageId) => {
    switch (id) {
      case "settings":
        return <SettingsPage onOpenAbout={() => navigate("about")} />;
      case "about":
        return <AboutPage onBack={() => navigate("settings")} />;
      case "batch":
        return <BatchPage />;
      case "video-convert":
        return <VideoConvertPage />;
      case "image-convert":
        return <ImageConvertPage />;
      case "video-clip":
        return <VideoClipPage />;
      case "audio-convert":
        return <AudioConvertPage />;
      case "media-info":
        return <MediaInfoPage />;
      case "tools":
        return <ToolsPage />;
      default:
        return <VideoConvertPage />;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <AppShell page={page} onNavigate={navigate} renderPage={renderPage}>
      </AppShell>
      <FirstRunDialog
        show={showFirstRun}
        onDone={handleFirstRunDone}
        onConfigured={() => setShowFirstRun(false)}
      />
    </>
  );
}

/** 等设置加载完成后再渲染应用；并把持久化的 language 同步给 I18nProvider（仅首次） */
function Inner() {
  const { settings, loading } = useSettings();
  const { setLang } = useI18n();
  const syncedRef = useRef(false);

  // settings.language 是语言的唯一真理源。首次加载完成时同步一次；
  // 运行期语言切换已在设置页直接 setLang（同批渲染），此处不再跟随，避免二次渲染闪烁
  useEffect(() => {
    if (settings && !syncedRef.current) {
      syncedRef.current = true;
      setLang(settings.language);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  if (loading && !settings) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-sm text-muted-foreground">
        FF-MediaTool
      </div>
    );
  }
  return (
    <TaskProvider>
      <TabManagerProvider>
        <Shell />
      </TabManagerProvider>
      <Toaster position="bottom-right" richColors closeButton />
    </TaskProvider>
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