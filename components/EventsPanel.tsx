"use client";

import { CalendarDays, Check, ExternalLink, LoaderCircle, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { haversine } from "@/lib/geo";
import { dateRange, EVENT_RANGES, formatEventWhen, type EventRange } from "@/lib/events";
import { LOCALE_TAG } from "@/lib/i18n";
import { eventsResponseSchema, type EventItem } from "@/lib/schemas";
import { EVENT_CATEGORIES } from "@/lib/themes";
import { cn, formatKm } from "@/lib/utils";
import type { LatLng } from "@/types";

type Range = EventRange;
const RANGES = EVENT_RANGES;
type CategoryFilter = "all" | EventItem["category"];

type State =
  | { status: "loading" }
  | { status: "ready"; events: EventItem[] }
  | { status: "error" };

const SOURCE_NAME: Record<EventItem["source"], string> = { ezine: "E-zine", ticketmaster: "Ticketmaster" };

const chip = (selected: boolean) =>
  cn(
    "min-h-9 shrink-0 rounded-full border px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
    selected ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink hover:bg-accent-soft",
  );

interface Props {
  start: LatLng;
  addedIds: string[];
  canAdd: boolean;
  onAdd: (event: EventItem) => void;
}

export function EventsPanel({ start, addedIds, canAdd, onAdd }: Props) {
  const { t, locale } = useI18n();
  const [range, setRange] = useState<Range>("week");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [draft, setDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    const { from, to } = dateRange(range);
    const params = new URLSearchParams({ lat: String(start.lat), lng: String(start.lng), from, to });
    if (keyword) params.set("q", keyword);
    if (category !== "all") params.set("category", category);
    setState({ status: "loading" });
    fetch(`/api/events?${params}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("events failed");
        const data = eventsResponseSchema.parse(await res.json());
        setState({ status: "ready", events: data.events });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });
    return () => controller.abort();
  }, [start.lat, start.lng, range, category, keyword]);

  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-3" data-testid="events-panel">
      <h2 className="flex items-center gap-2 font-semibold">
        <CalendarDays className="size-4 text-accent" aria-hidden />
        {t("events.title")}
      </h2>

      <>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setKeyword(draft.trim());
            }}
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("events.searchPlaceholder")}
              aria-label={t("events.searchPlaceholder")}
              enterKeyHint="search"
              className="h-10 text-sm"
            />
            <Button type="submit" variant="outline" size="icon" className="size-10 shrink-0" aria-label={t("events.search")}>
              <Search />
            </Button>
          </form>

          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
            {RANGES.map((r) => (
              <button key={r} type="button" aria-pressed={r === range} onClick={() => setRange(r)} className={chip(r === range)}>
                {t(`events.range.${r}`)}
              </button>
            ))}
          </div>
          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
            {(["all", ...EVENT_CATEGORIES] as const).map((c) => (
              <button key={c} type="button" aria-pressed={c === category} onClick={() => setCategory(c)} className={chip(c === category)}>
                {t(`events.cat.${c}`)}
              </button>
            ))}
          </div>

          {state.status === "loading" && (
            <p className="flex items-center gap-2 py-2 text-sm text-muted" role="status">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              {t("events.loading")}
            </p>
          )}
          {state.status === "error" && <p className="py-2 text-sm text-warn-ink">{t("error.EVENTS_UNAVAILABLE")}</p>}
          {state.status === "ready" && state.events.length === 0 && (
            <p className="py-2 text-sm text-muted">{t("events.empty")}</p>
          )}
          {state.status === "ready" && state.events.length > 0 && (
            <>
              <p className="text-xs text-muted">{t("events.count", { n: state.events.length })}</p>
              <ul className="max-h-96 divide-y divide-line overflow-y-auto">
                {state.events.map((event) => {
                  const added = addedIds.includes(`event/${event.id}`);
                  return (
                    <li key={event.id} className="flex items-center gap-2 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-medium">{event.name}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {formatEventWhen(event, locale)}
                          {event.venue && ` · ${event.venue}`}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                          <Badge>{t(`events.cat.${event.category}`)}</Badge>
                          <span>{t("events.away", { km: formatKm(haversine(start, event), locale) })}</span>
                          {event.priceFrom !== undefined && (
                            <span>
                              {t("events.from", {
                                price: new Intl.NumberFormat(LOCALE_TAG[locale], {
                                  style: "currency",
                                  currency: event.currency ?? "EUR",
                                  maximumFractionDigits: 0,
                                }).format(event.priceFrom),
                              })}
                            </span>
                          )}
                          <a
                            href={event.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-ink"
                          >
                            {t("route.tickets")} <ExternalLink className="size-3" aria-hidden />
                          </a>
                        </p>
                      </div>
                      <Button
                        variant={added ? "ghost" : "outline"}
                        size="sm"
                        className="shrink-0"
                        disabled={added || !canAdd}
                        onClick={() => onAdd(event)}
                      >
                        {added ? <Check /> : <Plus />}
                        <span className="max-[400px]:sr-only">
                          {added ? t("events.added") : canAdd ? t("events.add") : t("events.full")}
                        </span>
                      </Button>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-muted">
                {t("events.sources", {
                  names: [...new Set(state.events.map((e) => SOURCE_NAME[e.source]))].join(", "),
                })}
              </p>
            </>
          )}
      </>
    </section>
  );
}
