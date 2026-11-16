import type { Metadata, Viewport } from "next";
import { I18nProvider } from "@/components/I18nProvider";
import { LOCALE_TAG } from "@/lib/i18n";
import { getTranslator } from "@/lib/i18n/server";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("meta.title"), description: t("meta.description") };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#faf6ef" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { locale } = await getTranslator();
  return (
    <html lang={LOCALE_TAG[locale]}>
      <body>
        <I18nProvider initialLocale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
