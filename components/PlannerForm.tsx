"use client";

import { LoaderCircle, MapPin, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import LazyMap from "@/components/LazyMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CITIES, type City } from "@/lib/cities";
import { geocodeResponseSchema, type GeocodeResult } from "@/lib/schemas";
import { encodeRouteParams } from "@/lib/share";
import { DURATIONS, THEME_CONFIG, THEMES, targetMeters } from "@/lib/themes";
import { cn, formatKm } from "@/lib/utils";
import type { Duration, LatLng, Theme } from "@/types";

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; results: GeocodeResult[] }
  | { status: "error"; message: string };

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
  const [city, setCity] = useState<City>(CITIES[0]);
  const [duration, setDuration] = useState<Duration>(60);
  const [theme, setTheme] = useState<Theme>("coffee");
  const [start, setStart] = useState<LatLng>(CITIES[0].center);
  const [startLabel, setStartLabel] = useState(CITIES[0].startLabel);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  const [submitting, setSubmitting] = useState(false);

  function chooseCity(next: City) {
    setCity(next);
    setStart(next.center);
    setStartLabel(next.startLabel);
    setSearch({ status: "idle" });
  }

  // Runs only on an explicit submit: Nominatim's policy forbids autocomplete.
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
      setSearch({ status: "error", message: "地标搜索暂时不可用,请直接在地图上点选起点。" });
    }
  }

  function generate() {
    setSubmitting(true);
    router.push(
      `/route?${encodeRouteParams({ city: city.id, start, durationMinutes: duration, theme })}`,
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 p-4 lg:grid-cols-[400px_1fr] lg:grid-rows-[auto_1fr] lg:gap-x-8 lg:p-8">
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-balance">
            今天去哪儿走走?
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            选好城市、时长和主题,生成一条用真实街道连起来的漫步路线。
          </p>
        </div>

        <Field label="城市">
          <div className="flex flex-wrap gap-2">
            {CITIES.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={c.id === city.id}
                onClick={() => chooseCity(c)}
                className={chip(c.id === city.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        </Field>

        <Field label="步行时长">
          <div className="grid grid-cols-4 gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={d === duration}
                onClick={() => setDuration(d)}
                className={cn(chip(d === duration), "whitespace-nowrap px-1")}
              >
                {d} 分钟
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">
            约 {formatKm(targetMeters(duration))},按 4.5 km/h 估算,不含停留时间。
          </p>
        </Field>

        <Field label="主题">
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={t === theme}
                onClick={() => setTheme(t)}
                className={chip(t === theme)}
              >
                {THEME_CONFIG[t].label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">{THEME_CONFIG[theme].hint}</p>
        </Field>

        <Field label="起点">
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
              placeholder="输入地标,如 Fontana di Trevi"
              aria-label="搜索地标作为起点"
              enterKeyHint="search"
            />
            <Button type="submit" variant="outline" size="icon" aria-label="搜索" disabled={search.status === "loading"}>
              {search.status === "loading" ? <LoaderCircle className="animate-spin" /> : <Search />}
            </Button>
          </form>
          {search.status === "done" && search.results.length === 0 && (
            <p className="text-sm text-muted">没有找到这个地标,换个写法,或直接在地图上点选。</p>
          )}
          {search.status === "error" && <p className="text-sm text-warn-ink">{search.message}</p>}
          {search.status === "done" && search.results.length > 0 && (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
              {search.results.map((r) => (
                <li key={`${r.lat},${r.lng}`}>
                  <button
                    type="button"
                    className="block min-h-11 w-full px-3 py-2 text-left text-sm hover:bg-accent-soft"
                    onClick={() => {
                      setStart({ lat: r.lat, lng: r.lng });
                      setStartLabel(r.name.split(",")[0]);
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
              当前起点:<span className="font-medium text-ink" data-testid="start-label">{startLabel}</span>
              。也可以点地图换一个。
            </span>
          </p>
        </Field>
      </div>

      <div className="h-72 overflow-hidden rounded-xl border border-line lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-auto lg:min-h-[560px]">
        <LazyMap
          center={start}
          start={start}
          onPick={(p) => {
            setStart(p);
            setStartLabel("地图上选的位置");
          }}
        />
      </div>

      <div className="sticky bottom-0 -mx-4 border-t border-line bg-paper/95 p-4 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0">
        <Button size="lg" className="w-full" onClick={generate} disabled={submitting}>
          {submitting && <LoaderCircle className="animate-spin" />}
          生成路线
        </Button>
      </div>
    </div>
  );
}
