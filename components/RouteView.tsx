"use client";

import {
  ArrowLeft,
  Check,
  Download,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  Share2,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import LazyMap from "@/components/LazyMap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { findCity } from "@/lib/cities";
import { toGeoJSON } from "@/lib/geojson";
import { apiErrorSchema, routeResponseSchema } from "@/lib/schemas";
import { decodeRouteParams, encodeRouteParams } from "@/lib/share";
import { CATEGORY_LABEL, THEME_CONFIG } from "@/lib/themes";
import { cn, formatKm } from "@/lib/utils";
import type { RouteRequest, RouteResponse } from "@/types";

type State =
  | { status: "loading" }
  | { status: "ready"; route: RouteResponse; updating: boolean }
  | { status: "error"; message: string; canRetry: boolean };

const MIN_STOPS = 2;

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
    throw new Error(err.success ? err.data.error.message : "生成路线时出了点问题,请重试。");
  }
  // Never trust the wire, even our own API.
  return routeResponseSchema.parse(json);
}

export function RouteView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const req = useMemo(() => decodeRouteParams(new URLSearchParams(queryString)), [queryString]);

  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [activeStopId, setActiveStopId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Query string we already hold a route for; lets us pin the stops into the
  // URL after generating without triggering a second request.
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
        const message =
          err instanceof Error && !(err instanceof TypeError) && err.name !== "ZodError"
            ? err.message
            : "网络好像断了,或者服务返回了意外的内容。请重试。";
        setState({ status: "error", message, canRetry: true });
      });
    return () => controller.abort();
  }, [req, queryString, attempt]);

  if (!req) {
    return (
      <Message title="这个链接不完整">
        <p>路线参数缺失或不合法,可能是链接被截断了。</p>
        <Button asChild>
          <Link href="/">重新规划一条</Link>
        </Button>
      </Message>
    );
  }

  const city = findCity(req.city);
  const heading = `${city?.name ?? req.city} · ${THEME_CONFIG[req.theme].label}漫步`;

  function navigate(next: RouteRequest) {
    resolvedQuery.current = null;
    router.replace(`/route?${encodeRouteParams(next)}`, { scroll: false });
  }

  if (state.status === "loading") {
    return (
      <Shell heading={heading} map={<LazyMap center={req.start} start={req.start} />}>
        <div className="space-y-3" role="status" aria-live="polite">
          <p className="flex items-center gap-2 text-sm text-muted">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            正在挑选地点、规划步行路线…
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
      <Shell heading={heading} map={<LazyMap center={req.start} start={req.start} />}>
        <div className="space-y-4 rounded-xl border border-line bg-surface p-4" role="alert">
          <p className="flex items-start gap-2 font-medium">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
            没能生成路线
          </p>
          <p className="text-sm leading-relaxed text-muted">{state.message}</p>
          <div className="flex gap-2">
            <Button onClick={() => { resolvedQuery.current = null; setAttempt((n) => n + 1); }}>
              <RefreshCw /> 重试
            </Button>
            <Button variant="outline" asChild>
              <Link href="/">修改条件</Link>
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
      // The user dismissed the share sheet, or clipboard access was denied.
    }
  }

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
      heading={heading}
      map={
        <LazyMap
          center={req.start}
          start={req.start}
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
        <Stat label="距离" value={formatKm(route.summary.distanceMeters)} />
        <Stat label="步行" value={`${route.summary.durationMinutes} 分`} />
        <Stat label="停留" value={`${stayMinutes} 分`} />
        <Stat label="站点" value={`${route.summary.stopCount}`} />
      </dl>

      {route.warnings.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-warn-bg p-3 text-sm leading-relaxed text-warn-ink" data-testid="warnings">
          {route.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Button variant="outline" onClick={() => navigate({ ...req, stopIds: undefined, seed: (req.seed ?? 0) + 1 })} disabled={updating}>
          <RefreshCw className={cn(updating && "animate-spin")} /> 换一条
        </Button>
        <Button variant="outline" onClick={share}>
          {copied ? <Check /> : <Share2 />} {copied ? "已复制" : "分享"}
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
                <Badge>{CATEGORY_LABEL[stop.category]}</Badge>
                <span>建议停留 {stop.suggestedStayMinutes} 分钟</span>
                <a
                  href={stop.osmUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-ink"
                >
                  OSM <ExternalLink className="size-3" aria-hidden />
                </a>
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`删除站点 ${stop.name}`}
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

      <p className="text-xs leading-relaxed text-muted">
        地图与地点数据 ©{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline underline-offset-2">
          OpenStreetMap 贡献者
        </a>
        ,以 ODbL 授权。步行路径由 OSRM 计算。步行时间按 4.5 km/h 估算。
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

function Shell({ heading, map, children }: { heading: string; map: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col lg:h-dvh lg:flex-row-reverse">
      <div className="h-[42dvh] min-h-64 shrink-0 border-b border-line lg:h-auto lg:flex-1 lg:border-b-0 lg:border-l" data-testid="map">
        {map}
      </div>
      <section className="w-full space-y-4 p-4 lg:w-[420px] lg:shrink-0 lg:overflow-y-auto lg:p-6">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" asChild className="-ml-2">
            <Link href="/" aria-label="返回首页">
              <ArrowLeft />
            </Link>
          </Button>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{heading}</h1>
        </div>
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
