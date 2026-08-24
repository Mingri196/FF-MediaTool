import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { zh, type I18nKey } from "./locales/zh";
import { en } from "./locales/en";
import type { Language } from "@/types";

const DICTS: Record<Language, Record<I18nKey, string>> = { zh, en };

export type TFunc = (
  key: I18nKey,
  vars?: Record<string, string | number>,
) => string;

interface I18nValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: TFunc;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  lang,
  setLang,
  children,
}: {
  lang: Language;
  setLang: (lang: Language) => void;
  children: ReactNode;
}) {
  const t = useCallback<TFunc>(
    (key, vars) => {
      let text: string = DICTS[lang][key] ?? zh[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replaceAll(`{${k}}`, String(v));
        }
      }
      return text;
    },
    [lang],
  );

  const value = useMemo<I18nValue>(
    () => ({ lang, setLang, t }),
    [lang, setLang, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}