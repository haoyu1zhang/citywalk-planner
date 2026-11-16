"use client";

import { Footprints, Heart, LoaderCircle, MapPin, Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import LazyMap from "@/components/LazyMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CITIES, type City } from "@/lib/cities";
import { geocodeResponseSchema, type GeocodeResult } from "@/lib/schemas";
import { encodeRouteParams } from "@/lib/share";
import { DURATIONS, THEMES, targetMeters } from "@/lib/themes";
import { cn, formatKm } from "@/lib/utils";
import type { Duration, LatLng, Theme } from "@/types";

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; results: GeocodeResult[] }
  | { status: "error" };

type Mode = "walk" | "date";
type StartSource = { kind: "default" } | { kind: "search"; label: string } | { kind: "map" };

const WALK_THEMES = THEMES.filter((t) => t !== "date");

const chip = (selected: boolean) =>
  cn(
    "min-h-11 rounded-lg border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
    selected
      ? "border-accent bg-accent text-white"
      : "border-line bg-surface text-ink hover:bg-accent-soft",
  );

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-semibold text-ink">{label}</legend>
      {children}
    </fieldset>
  );
}

export function PlannerForm() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [mode, setMode] = useState<Mode>("walk");
  const [city, setCity] = useState<City>(CITIES[0]);
  const [duration, setDuration] = useState<Duration>(60);
  const [theme, setTheme] = useState<Exclude<Theme, "date">>("coffee");
  const [start, setStart] = useState<LatLng>(CITIES[0].center);
  const [startSource, setStartSource] = useState<StartSource>({ kind: "default" });
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  const [submitting, setSubmitting] = useState(false);

  const startLabel =
    startSource.kind === "default"
      ? t(`cityStart.${city.id}` as "cityStart.rome")
      : startSource.kind === "search"
        ? startSource.label
        : t("form.pickedOnMap");

  function chooseCity(next: City) {
    setCity(next);
    setStart(next.center);
    setStartSource({ kind: "default" });
    setSearch({ status: "idle" });
  }

  // submit only: Nominatim forbids autocomplete
  async function runSearch() {
    const q = query.trim();
    if (q.length < 2) return;
    setSearch({ status: "loading" });
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(`${q}, ${city.query}`)}`);
      const parsed = geocodeResponseSchema.safeParse(await res.json());
      if (!res.ok || !parsed.success) throw new Error("geocode failed");
      setSearch({ status: "done", results: parsed.data.results });
    } catch {
      setSearch({ status: "error" });
    }
  }

  function generate(seed?: number) {
    setSubmitting(true);
    router.push(
      `/route?${encodeRouteParams({
        city: city.id,
        start,
        durationMinutes: duration,
        theme: mode === "date" ? "date" : theme,
        seed,
      })}`,
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 p-4 lg:grid-cols-[400px_1fr] lg:grid-rows-[auto_1fr] lg:gap-x-8 lg:p-8">
      <div className="space-y-6">
        <div
          role="radiogroup"
          aria-label={t("mode.label")}
          className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface p-1"
        >
          {(["walk", "date"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                mode === m ? "bg-accent text-white" : "text-muted hover:text-ink",
              )}
            >
              {m === "walk" ? <Footprints className="size-4" aria-hidden /> : <Heart className="size-4" aria-hidden />}
              {t(`mode.${m}`)}
            </button>
          ))}
        </div>

        <div>
          <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-balance">
            {t(mode === "date" ? "home.dateTitle" : "home.title")}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {t(mode === "date" ? "home.dateSubtitle" : "home.subtitle")}
          </p>
        </div>

        <Field label={t("form.city")}>
          <div className="flex flex-wrap gap-2">
            {CITIES.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={c.id === city.id}
                onClick={() => chooseCity(c)}
                className={chip(c.id === city.id)}
                data-city={c.id}
              >
                {t(`city.${c.id}` as "city.rome")}
              </button>
            ))}
          </div>
        </Field>

        <Field label={t("form.duration")}>
          <div className="grid grid-cols-4 gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={d === duration}
                onClick={() => setDuration(d)}
                className={cn(chip(d === duration), "whitespace-nowrap px-1")}
                data-duration={d}
              >
                {t("form.minutes", { n: d })}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">{t("form.durationHint", { km: formatKm(targetMeters(duration), locale) })}</p>
        </Field>

        {mode === "walk" ? (
          <Field label={t("form.theme")}>
            <div className="grid grid-cols-3 gap-2">
              {WALK_THEMES.map((th) => (
                <button
                  key={th}
                  type="button"
                  aria-pressed={th === theme}
                  onClick={() => setTheme(th)}
                  className={cn(chip(th === theme), "px-1")}
                  data-theme={th}
                >
                  {t(`theme.${th}`)}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">{t(`themeHint.${theme}`)}</p>
          </Field>
        ) : (
          <p className="flex items-start gap-2 rounded-xl bg-accent-soft p-3 text-sm leading-relaxed text-accent-strong">
            <Heart className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("form.dateArc")}
          </p>
        )}

        <Field label={t("form.start")}>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch();
            }}
          >
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("form.searchPlaceholder")}
              aria-label={t("form.searchLabel")}
              enterKeyHint="search"
            />
            <Button
              type="submit"
              variant="outline"
              size="icon"
              className="shrink-0"
              aria-label={t("form.search")}
              disabled={search.status === "loading"}
            >
              {search.status === "loading" ? <LoaderCircle className="animate-spin" /> : <Search />}
            </Button>
          </form>
          {search.status === "done" && search.results.length === 0 && (
            <p className="text-sm text-muted">{t("form.searchEmpty")}</p>
          )}
          {search.status === "error" && <p className="text-sm text-warn-ink">{t("form.searchError")}</p>}
          {search.status === "done" && search.results.length > 0 && (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
              {search.results.map((r) => (
                <li key={`${r.lat},${r.lng}`}>
                  <button
                    type="button"
                    className="block min-h-11 w-full px-3 py-2 text-left text-sm hover:bg-accent-soft"
                    onClick={() => {
                      setStart({ lat: r.lat, lng: r.lng });
                      setStartSource({ kind: "search", label: r.name.split(",")[0] });
                      setSearch({ status: "idle" });
                      setQuery("");
                    }}
                  >
                    {r.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="flex items-start gap-1.5 text-sm text-muted">
            <MapPin className="mt-0.5 size-4 shrink-0 text-route" aria-hidden />
            <span>
              {t("form.currentStart")}
              <span className="font-medium text-ink" data-testid="start-label">
                {startLabel}
              </span>
              . {t("form.pickHint")}
            </span>
          </p>
        </Field>
      </div>

      <div className="h-72 overflow-hidden rounded-xl border border-line lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-auto lg:min-h-[560px]">
        <LazyMap
          center={start}
          start={start}
          startLabel={t("map.start")}
          onPick={(p) => {
            setStart(p);
            setStartSource({ kind: "map" });
          }}
        />
      </div>

      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-line bg-paper/95 p-4 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0">
        <Button size="lg" className="min-w-0 flex-1 px-3" onClick={() => generate()} disabled={submitting} data-testid="generate">
          {submitting && <LoaderCircle className="animate-spin" />}
          <span className="truncate">{t("form.generate")}</span>
        </Button>
        {mode === "date" && (
          <Button
            size="lg"
            variant="outline"
            className="min-w-0 shrink px-3"
            // random seed, still shareable
            onClick={() => generate(1 + Math.floor(Math.random() * 9998))}
            disabled={submitting}
            data-testid="surprise"
          >
            <Sparkles /> <span className="truncate">{t("form.surprise")}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
