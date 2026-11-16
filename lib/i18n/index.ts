import { MESSAGES, type MessageKey } from "./messages";

export const LOCALES = ["zh", "en", "it"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "cw_lang";
export const LOCALE_NAMES: Record<Locale, string> = { zh: "中文", en: "English", it: "Italiano" };
/** BCP 47 tags for <html lang> and Intl formatting. */
export const LOCALE_TAG: Record<Locale, string> = { zh: "zh-CN", en: "en-GB", it: "it-IT" };

export type { MessageKey };
export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const template = MESSAGES[locale][key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** For keys built at runtime (e.g. `warning.${code}`): null if there is no such message. */
export function translateMaybe(locale: Locale, key: string): string | null {
  return key in MESSAGES[locale] ? translate(locale, key as MessageKey) : null;
}

/** Picks the best supported locale from an Accept-Language header. */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { lang: tag.toLowerCase().split("-")[0], q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { lang } of ranked) if (isLocale(lang)) return lang;
  return DEFAULT_LOCALE;
}
