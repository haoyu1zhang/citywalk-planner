import { cookies, headers } from "next/headers";
import { isLocale, LOCALE_COOKIE, negotiateLocale, translate, type Locale, type Translate } from "./index";

/** The visitor's choice (cookie) wins; otherwise the browser's language. */
export async function getLocale(): Promise<Locale> {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  return negotiateLocale((await headers()).get("accept-language"));
}

export async function getTranslator(): Promise<{ locale: Locale; t: Translate }> {
  const locale = await getLocale();
  return { locale, t: (key, vars) => translate(locale, key, vars) };
}
