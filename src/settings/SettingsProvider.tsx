import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { api } from "@/lib/tauri";
import type { AppSettings } from "@/types";
import { useI18n } from "@/i18n";

interface SettingsContextValue {
  /** 后端加载的完整设置；加载完成前为 null */
  settings: AppSettings | null;
  /** 乐观更新 + 防抖持久化 */
  update: (partial: Partial<AppSettings>) => void;
  /** 立即把整份设置写盘（返回 Promise，失败会弹 toast） */
  persist: (next: AppSettings) => Promise<boolean>;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const SAVE_DEBOUNCE_MS = 300;

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const latestRef = useRef<AppSettings | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failedRef = useRef(false);

  // 启动时从后端加载
  useEffect(() => {
    let cancelled = false;
    api
      .getSettings()
      .then((s) => {
        if (cancelled) return;
        latestRef.current = s;
        setSettings(s);
      })
      .catch((e) => {
        console.error("加载设置失败", e);
        if (!cancelled) toast.error(t("error.settingsLoadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const persist = useCallback(
    async (next: AppSettings): Promise<boolean> => {
      try {
        const saved = await api.saveSettings(next);
        latestRef.current = saved;
        setSettings(saved);
        return true;
      } catch (e) {
        console.error("保存设置失败", e);
        failedRef.current = true;
        toast.error(t("error.settingsSaveFailed"));
        return false;
      }
    },
    [t],
  );

  const update = useCallback(
    (partial: Partial<AppSettings>) => {
      // 未加载完成时的更新请求忽略（理论上不会发生）
      if (!latestRef.current) return;
      const next: AppSettings = { ...latestRef.current, ...partial };
      latestRef.current = next;
      setSettings(next); // 乐观更新，界面即时生效

      // 防抖持久化；失败后保留内存态，等待下一次修改重试
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void persist(next);
      }, SAVE_DEBOUNCE_MS);
    },
    [persist],
  );

  return (
    <SettingsContext.Provider value={{ settings, update, persist, loading }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}