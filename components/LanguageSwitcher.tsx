"use client";

import { Languages } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { isLocale, LOCALE_NAMES, LOCALES } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="flex h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-muted focus-within:ring-2 focus-within:ring-accent hover:text-ink">
      <Languages className="size-4" aria-hidden />
      <span className="sr-only">{t("nav.language")}</span>
      <select
        value={locale}
        onChange={(e) => isLocale(e.target.value) && setLocale(e.target.value)}
        className="cursor-pointer bg-transparent py-2 text-ink outline-none"
        data-testid="language-select"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
