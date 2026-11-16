import { Footprints } from "lucide-react";
import Link from "next/link";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getTranslator } from "@/lib/i18n/server";

export async function SiteHeader() {
  const { t } = await getTranslator();
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line bg-paper px-4">
      <Link href="/" className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
        <Footprints className="size-5 shrink-0 text-accent" aria-hidden />
        <span className="max-[380px]:sr-only">CityWalk Planner</span>
      </Link>
      <nav className="flex items-center text-sm">
        <LanguageSwitcher />
        <Link href="/about" className="rounded-md px-2 py-2 text-muted hover:text-ink">
          {t("nav.about")}
        </Link>
      </nav>
    </header>
  );
}
