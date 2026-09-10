import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { en, type MessageKey } from './messages/en';

export type UiLocale = 'en';

interface I18nContextValue {
  locale: UiLocale;
  setLocale: (locale: UiLocale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] !== undefined ? String(vars[name]) : `{${name}}`,
  );
}

export function I18nProvider({
  locale,
  onLocaleChange,
  children,
}: {
  locale: UiLocale;
  onLocaleChange?: (locale: UiLocale) => void;
  children: ReactNode;
}) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback(
    (next: UiLocale) => {
      onLocaleChange?.(next);
    },
    [onLocaleChange],
  );

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => {
      const raw = en[key] ?? key;
      return interpolate(raw, vars);
    },
    [],
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
    }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within an I18nProvider');
  return context;
}
