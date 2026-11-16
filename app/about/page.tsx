import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { getTranslator } from "@/lib/i18n/server";

export default async function AboutPage() {
  const { t } = await getTranslator();
  const challenges = (["c1", "c2", "c3"] as const).map((k) => ({
    title: t(`about.${k}.title`),
    body: t(`about.${k}.body`),
  }));
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl space-y-6 p-4 py-8 lg:py-12">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{t("about.title")}</h1>
        <p className="leading-relaxed text-muted">{t("about.intro")}</p>
        <ol className="space-y-3">
          {challenges.map((c, i) => (
            <li key={c.title} className="rounded-xl border border-line bg-surface p-4">
              <h2 className="font-semibold">
                {i + 1}. {c.title}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{c.body}</p>
            </li>
          ))}
        </ol>
        <p className="text-sm leading-relaxed text-muted">
          {t("about.stack", { osm: "OpenStreetMap contributors" })}
        </p>
        <Link href="/" className="inline-block text-sm font-medium text-accent underline underline-offset-2">
          {t("about.cta")}
        </Link>
      </main>
    </div>
  );
}
