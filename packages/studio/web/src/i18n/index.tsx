import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { messages, type Locale } from './messages';

const STORAGE_KEY = 'gamedream.locale';

type Vars = Record<string, string | number>;

export interface I18nValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  toggle: () => void;
  t: (key: string, vars?: Vars) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function readLocale(): Locale {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'zh';
  } catch {
    return 'zh';
  }
}

function translate(locale: Locale, key: string, vars?: Vars): string {
  const table = messages[locale] as Record<string, string>;
  const fallback = messages.zh as Record<string, string>;
  let value = table[key] ?? fallback[key] ?? key;
  if (vars) {
    for (const [name, replacement] of Object.entries(vars)) {
      value = value.replaceAll(`{${name}}`, String(replacement));
    }
  }
  return value;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readLocale);

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // 隐私模式下不可写，忽略即可
    }
  }, [locale]);

  const t = useCallback((key: string, vars?: Vars) => translate(locale, key, vars), [locale]);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      t,
      setLocale: (next) => setLocaleState(next === 'en' ? 'en' : 'zh'),
      toggle: () => setLocaleState((current) => (current === 'zh' ? 'en' : 'zh')),
    }),
    [locale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}

export function formatDate(value: string | undefined, locale: Locale): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US');
}

export type { Locale };
