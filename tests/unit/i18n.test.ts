import { describe, expect, it } from "vitest";
import { LOCALES, negotiateLocale, translate, translateMaybe } from "@/lib/i18n";
import { MESSAGES } from "@/lib/i18n/messages";
import { apiErrorSchema, WARNING_CODES } from "@/lib/schemas";
import { CITIES } from "@/lib/cities";
import { EVENT_CATEGORIES, STOP_CATEGORIES, THEMES } from "@/lib/themes";

describe("i18n", () => {
  it("has the same keys and placeholders in every language", () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const locale of LOCALES) {
      expect(Object.keys(MESSAGES[locale]).sort()).toEqual(Object.keys(MESSAGES.zh).sort());
      for (const [key, value] of Object.entries(MESSAGES[locale])) {
        expect(value.trim(), `${locale}:${key}`).not.toBe("");
        expect(placeholders(value), `${locale}:${key}`).toBe(placeholders(MESSAGES.zh[key as keyof typeof MESSAGES.zh]));
      }
    }
  });

  // keys built at runtime aren't type-checked
  it("has a message for every dynamic key", () => {
    const keys = [
      ...WARNING_CODES.map((c) => `warning.${c}`),
      ...apiErrorSchema.shape.error.shape.code.options.map((c) => `error.${c}`),
      ...THEMES.flatMap((t) => [`theme.${t}`, `themeHint.${t}`]),
      ...STOP_CATEGORIES.map((c) => `category.${c}`),
      ...EVENT_CATEGORIES.map((c) => `events.cat.${c}`),
      ...CITIES.flatMap((c) => [`city.${c.id}`, `cityStart.${c.id}`]),
    ];
    for (const locale of LOCALES) for (const key of keys) {
      expect(translateMaybe(locale, key), `${locale}:${key}`).not.toBeNull();
    }
  });

  it("interpolates variables", () => {
    expect(translate("en", "form.minutes", { n: 60 })).toBe("60 min");
    expect(translate("it", "route.headingDate", { city: "Roma" })).toBe("Roma · Passeggiata a due");
    expect(translate("zh", "route.heading", { city: "罗马", theme: "咖啡" })).toBe("罗马 · 咖啡漫步");
  });

  it("negotiates the language from Accept-Language", () => {
    expect(negotiateLocale("zh-CN,zh;q=0.9,en;q=0.8")).toBe("zh");
    expect(negotiateLocale("it-IT,it;q=0.9")).toBe("it");
    expect(negotiateLocale("de-DE,de;q=0.9,it;q=0.5,en;q=0.7")).toBe("en");
    expect(negotiateLocale("fr-FR")).toBe("en");
    expect(negotiateLocale(null)).toBe("en");
  });
});
