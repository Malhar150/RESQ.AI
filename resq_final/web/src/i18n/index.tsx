import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import en, { type Key } from "./en";
import hi from "./hi";
import as from "./as";
import bn from "./bn";

export type Lang = "en" | "hi" | "as" | "bn";
export const LANGS: Lang[] = ["en", "hi", "as", "bn"];
const DICTS: Record<Lang, Record<Key, string>> = { en, hi, as, bn };

/** BCP-47 tags for speech recognition and number/date formatting. */
export const LOCALE: Record<Lang, string> = { en: "en-IN", hi: "hi-IN", as: "as-IN", bn: "bn-IN" };

const LS = "resq.lang";

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LS) as Lang | null;
    if (saved && LANGS.includes(saved)) return saved;
  } catch { /* ignore */ }
  const nav = (typeof navigator !== "undefined" ? navigator.language : "en").slice(0, 2) as Lang;
  return LANGS.includes(nav) ? nav : "en";
}

export type T = (key: Key, vars?: Record<string, string | number>) => string;

interface Ctx { lang: Lang; setLang: (l: Lang) => void; t: T }
const I18n = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(LS, l); } catch { /* ignore */ }
  }, []);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const t = useCallback<T>((key, vars) => {
    let s = DICTS[lang][key] ?? en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18n);
  if (!ctx) throw new Error("useI18n outside provider");
  return ctx;
}

export const LANG_NAMES: Record<Lang, string> = { en: en["lang.name"], hi: hi["lang.name"], as: as["lang.name"], bn: bn["lang.name"] };

/** Language codes the backend's detector returns (ISO 639-1) → readable name. */
export function languageName(code: string | null | undefined): string {
  const names: Record<string, string> = {
    en: "English", hi: "हिन्दी", as: "অসমীয়া", bn: "বাংলা", pa: "ਪੰਜਾਬੀ", or: "ଓଡ଼ିଆ",
  };
  if (!code) return "—";
  return names[code] || code;
}

export type { Key };
