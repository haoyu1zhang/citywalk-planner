"use client";

import {
  ArrowLeft,
  CalendarDays,
  Check,
  Download,
  Dices,
  ExternalLink,
  LoaderCircle,
  Navigation,
  RefreshCw,
  Share2,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { EventsPanel } from "@/components/EventsPanel";
import { useI18n } from "@/components/I18nProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import LazyMap from "@/components/LazyMap";
import { SpinWheel } from "@/components/SpinWheel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { findCity } from "@/lib/cities";
import { toGeoJSON } from "@/lib/geojson";
import { cheapestInsertion, formatEventWhen } from "@/lib/events";
import { translateMaybe, type MessageKey } from "@/lib/i18n";
import { apiErrorSchema, routeResponseSchema, type EventItem } from "@/lib/schemas";
import { decodeRouteParams, encodeRouteParams, googleMapsUrl } from "@/lib/share";
import { cn, formatKm } from "@/lib/utils";
import type { LatLng, RouteRequest, RouteResponse } from "@/types";

type State =
  | { status: "loading" }
  | { status: "ready"; route: RouteResponse; updating: boolean }
  | { status: "error"; messageKey: MessageKey };

const MIN_STOPS = 2;
const MAX_STOPS = 12;

class ApiError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function requestRoute(req: RouteRequest, signal: AbortSignal): Promise<RouteResponse> {
  const res = await fetch("/api/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = apiErrorSchema.safeParse(json);
    throw new ApiError(err.success ? err.data.error.code : "INTERNAL");
  }
  return routeResponseSchema.parse(json);
}

export function RouteView() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [panel, setPanel] = useState<"wheel" | "events" | null>(null);
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const req = useMemo(() => decodeRouteParams(new URLSearchParams(queryString)), [queryString]);

  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [activeStopId, setActiveStopId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // query string we already have a route for, so pinning stops into the URL doesn't refetch
  const resolvedQuery = useRef<string | null>(null);

  useEffect(() => {
    if (!req) return;
    if (resolvedQuery.current === queryString) return;
    const controller = new AbortController();
    setState((prev) => (prev.status === "ready" ? { ...prev, updating: true } : { status: "loading" }));

    requestRoute(req, controller.signal)
      .then((route) => {
        const pinned = encodeRouteParams({ ...req, stopIds: route.stops.map((s) => s.id) });
        resolvedQuery.current = pinned;
        if (pinned !== queryString) window.history.replaceState(null, "", `/route?${pinned}`);
        setState({ status: "ready", route, updating: false });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const key = err instanceof ApiError ? `error.${err.code}` : "error.NETWORK";
        const known = translateMaybe("en", key) !== null;
        setState({ status: "error", messageKey: (known ? key : "error.NETWORK") as MessageKey });
      });
    return () => controller.abort();
  }, [req, queryString, attempt]);

  if (!req) {
    return (
      <Message title={t("route.badLinkTitle")}>
        <p>{t("route.badLinkBody")}</p>
        <Button asChild>
          <Link href="/">{t("route.planNew")}</Link>
        </Button>
      </Message>
    );
  }

  const city = findCity(req.city);
  const cityName = city ? t(`city.${city.id}` as "city.rome") : req.city;
  const heading =
    req.theme === "date"
      ? t("route.headingDate", { city: cityName })
      : t("route.heading", { city: cityName, theme: t(`theme.${req.theme}`) });
  const shell = { heading, backLabel: t("route.back") };
  const plainMap = <LazyMap center={req.start} start={req.start} startLabel={t("map.start")} />;

  function navigate(next: RouteRequest) {
    resolvedQuery.current = null;
    router.replace(`/route?${encodeRouteParams(next)}`, { scroll: false });
  }

  if (state.status === "loading") {
    return (
      <Shell {...shell} map={plainMap}>
        <div className="space-y-3" role="status" aria-live="polite">
          <p className="flex items-center gap-2 text-sm text-muted">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            {t("route.loading")}
          </p>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-line/60" />
          ))}
        </div>
      </Shell>
    );
  }

  if (state.status === "error") {
    return (
      <Shell {...shell} map={plainMap}>
        <div className="space-y-4 rounded-xl border border-line bg-surface p-4" role="alert">
          <p className="flex items-start gap-2 font-medium">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
            {t("route.failed")}
          </p>
          <p className="text-sm leading-relaxed text-muted">{t(state.messageKey)}</p>
          <div className="flex gap-2">
            <Button onClick={() => { resolvedQuery.current = null; setAttempt((n) => n + 1); }}>
              <RefreshCw /> {t("route.retry")}
            </Button>
            <Button variant="outline" asChild>
              <Link href="/">{t("route.edit")}</Link>
            </Button>
          </div>
        </div>
      </Shell>
    );
  }

  const { route, updating } = state;
  const stayMinutes = route.stops.reduce((sum, s) => sum + s.suggestedStayMinutes, 0);

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: heading, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // share sheet dismissed or clipboard denied
    }
  }

  // new stops go where they add the least walking
  function addStop(id: string, point: LatLng) {
    if (!req) return;
    const ids = route.stops.map((s) => s.id);
    ids.splice(cheapestInsertion(req.start, route.stops, point), 0, id);
    navigate({ ...req, stopIds: ids });
  }
  const canAdd = !updating && route.stops.length < MAX_STOPS;
  const mapsUrl = googleMapsUrl(req.start, route.stops);
  const [attributionBefore, attributionAfter] = t("route.attribution").split("{osm}");

  function exportGeoJSON() {
    const blob = new Blob([JSON.stringify(toGeoJSON(route), null, 2)], { type: "application/geo+json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `citywalk-${route.routeId}.geojson`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Shell
      {...shell}
      map={
        <LazyMap
          center={req.start}
          start={req.start}
          startLabel={t("map.start")}
          stops={route.stops}
          geometry={route.geometry}
          activeStopId={activeStopId}
          onStopSelect={(id) => {
            setActiveStopId(id);
            document.getElementById(`stop-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }}
        />
      }
    >
      <dl className="grid grid-cols-4 divide-x divide-line rounded-xl border border-line bg-surface text-center" data-testid="summary">
        <Stat label={t("route.distance")} value={formatKm(route.summary.distanceMeters, locale)} />
        <Stat label={t("route.walk")} value={t("route.min", { n: route.summary.durationMinutes })} />
        <Stat label={t("route.stay")} value={t("route.min", { n: stayMinutes })} />
        <Stat label={t("route.stops")} value={`${route.summary.stopCount}`} />
      </dl>

      {route.warnings.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-warn-bg p-3 text-sm leading-relaxed text-warn-ink" data-testid="warnings">
          {route.warnings.map((w) => (
            <li key={w} data-code={w}>
              {translateMaybe(locale, `warning.${w}`) ?? w}
            </li>
          ))}
        </ul>
      )}

      {mapsUrl && (
        <Button asChild className="w-full">
          <a href={mapsUrl} target="_blank" rel="noreferrer" data-testid="navigate">
            <Navigation /> {t("route.navigate")}
          </a>
        </Button>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Button variant="outline" onClick={() => navigate({ ...req, stopIds: undefined, seed: (req.seed ?? 0) + 1 })} disabled={updating}>
          <RefreshCw className={cn(updating && "animate-spin")} /> {t("route.regenerate")}
        </Button>
        <Button variant="outline" onClick={share}>
          {copied ? <Check /> : <Share2 />} {copied ? t("route.copied") : t("route.share")}
        </Button>
        <Button variant="outline" onClick={exportGeoJSON}>
          <Download /> GeoJSON
        </Button>
      </div>

      <ol className={cn("space-y-2 transition-opacity", updating && "opacity-50")} data-testid="stop-list" aria-busy={updating}>
        {route.stops.map((stop, i) => (
          <li
            key={stop.id}
            id={`stop-${stop.id}`}
            className={cn(
              "flex items-center gap-3 rounded-xl border bg-surface p-3",
              stop.id === activeStopId ? "border-accent" : "border-line",
            )}
            onMouseEnter={() => setActiveStopId(stop.id)}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-white tabular-nums">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium" data-testid="stop-name">{stop.name}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <Badge>{t(`category.${stop.category}`)}</Badge>
                {stop.event ? (
                  <span>
                    {formatEventWhen(stop.event, locale)}
                    {stop.event.venue && ` · ${stop.event.venue}`}
                  </span>
                ) : (
                  <span>{t("route.stayHint", { n: stop.suggestedStayMinutes })}</span>
                )}
                <a
                  href={stop.event?.url ?? stop.osmUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-ink"
                >
                  {stop.event ? t("route.tickets") : "OSM"} <ExternalLink className="size-3" aria-hidden />
                </a>
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("route.delete", { name: stop.name })}
              data-testid="delete-stop"
              disabled={updating || route.stops.length <= MIN_STOPS}
              onClick={() =>
                navigate({ ...req, stopIds: route.stops.filter((s) => s.id !== stop.id).map((s) => s.id) })
              }
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={panel === "wheel" ? "default" : "outline"}
          onClick={() => setPanel(panel === "wheel" ? null : "wheel")}
          aria-expanded={panel === "wheel"}
          data-testid="wheel-open"
        >
          <Dices /> {t("wheel.open")}
        </Button>
        <Button
          variant={panel === "events" ? "default" : "outline"}
          onClick={() => setPanel(panel === "events" ? null : "events")}
          aria-expanded={panel === "events"}
          data-testid="events-open"
        >
          <CalendarDays /> {t("events.open")}
        </Button>
      </div>
      {panel === "wheel" && (
        <SpinWheel
          req={req}
          stopIds={route.stops.map((s) => s.id)}
          canAdd={canAdd}
          onAdd={(place) => addStop(place.id, place)}
        />
      )}
      {panel === "events" && (
        <EventsPanel
          start={req.start}
          addedIds={route.stops.map((s) => s.id)}
          canAdd={canAdd}
          onAdd={(event: EventItem) => addStop(`event/${event.id}`, event)}
        />
      )}

      <p className="text-xs leading-relaxed text-muted" data-testid="attribution">
        {attributionBefore}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline underline-offset-2">
          {t("route.osmContributors")}
        </a>
        {attributionAfter}
      </p>
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-1 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Shell({
  heading,
  backLabel,
  map,
  children,
}: {
  heading: string;
  backLabel: string;
  map: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col lg:h-dvh lg:flex-row-reverse">
      <div className="h-[42dvh] min-h-64 shrink-0 border-b border-line lg:h-auto lg:flex-1 lg:border-b-0 lg:border-l" data-testid="map">
        {map}
      </div>
      <section className="w-full space-y-4 p-4 lg:w-[420px] lg:shrink-0 lg:overflow-y-auto lg:p-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" asChild className="-ml-2">
            <Link href="/" aria-label={backLabel}>
              <ArrowLeft />
            </Link>
          </Button>
          <LanguageSwitcher />
        </div>
        <h1 className="font-display text-2xl font-semibold leading-tight tracking-tight text-balance">{heading}</h1>
        {children}
      </section>
    </div>
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md space-y-4 p-6 pt-16 text-center">
      <h1 className="font-display text-2xl font-semibold">{title}</h1>
      <div className="space-y-4 text-sm leading-relaxed text-muted">{children}</div>
    </div>
  );
}
