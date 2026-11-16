import { createHash } from "node:crypto";
import { roundCoord } from "@/lib/geo";
import type { EventProvider, PoiProvider, RoutedPath, RoutingProvider } from "@/lib/providers/types";
import {
  EVENT_STAY_MINUTES,
  MAX_DETOUR_FACTOR,
  STAY_MINUTES,
  targetMeters,
  themeCategories,
  walkMinutes,
} from "@/lib/themes";
import type { EventItem, LatLng, Poi, RouteRequest, RouteResponse, RouteStop, WarningCode } from "@/types";
import { estimateMeters, MIN_STOPS, dropCostliestStop, planRoute, searchRadius } from "./plan";
import { orderStops } from "./order";

export type RouteErrorCode = "NO_RESULTS" | "POI_UNAVAILABLE";

export class RouteError extends Error {
  constructor(
    readonly code: RouteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RouteError";
  }
}

export interface RouteDeps {
  pois: PoiProvider;
  fallbackPois?: PoiProvider;
  /** null = offline mode: skip routing and draw straight lines. */
  routing: RoutingProvider | null;
  events?: EventProvider | null;
}

type EventStop = Omit<Poi, "category"> & { category: "event"; event: EventItem };
type Stop = Poi | EventStop;

function eventStop(event: EventItem): EventStop {
  return { id: `event/${event.id}`, name: event.name, category: "event", lat: event.lat, lng: event.lng, tagCount: 0, event };
}

function toStop(poi: Stop): RouteStop {
  if (poi.category === "event") {
    const { startsAt, endsAt, url, venue, category } = poi.event;
    return {
      id: poi.id,
      name: poi.name,
      category: "event",
      lat: poi.lat,
      lng: poi.lng,
      suggestedStayMinutes: EVENT_STAY_MINUTES,
      osmUrl: `https://www.openstreetmap.org/?mlat=${poi.lat}&mlon=${poi.lng}#map=18/${poi.lat}/${poi.lng}`,
      event: { startsAt, endsAt, url, venue, category },
    };
  }
  return {
    id: poi.id,
    name: poi.name,
    category: poi.category,
    lat: poi.lat,
    lng: poi.lng,
    suggestedStayMinutes: STAY_MINUTES[poi.category],
    osmUrl: `https://www.openstreetmap.org/${poi.id}`,
  };
}

function straightPath(points: LatLng[]): RoutedPath {
  return {
    geometry: { type: "LineString", coordinates: points.map((p) => [p.lng, p.lat]) },
    distanceMeters: estimateMeters(points[0], points.slice(1)),
  };
}

async function withFallback<T>(
  deps: RouteDeps,
  call: (p: PoiProvider) => Promise<T[]>,
): Promise<{ items: T[]; usedFallback: boolean; liveFailed: boolean }> {
  try {
    return { items: await call(deps.pois), usedFallback: false, liveFailed: false };
  } catch {
    if (!deps.fallbackPois) return { items: [], usedFallback: false, liveFailed: true };
    return { items: await call(deps.fallbackPois), usedFallback: true, liveFailed: true };
  }
}

export async function generateRoute(req: RouteRequest, deps: RouteDeps): Promise<RouteResponse> {
  const warnings: WarningCode[] = [];
  const target = targetMeters(req.durationMinutes);
  let stops: Stop[] | null = null;
  const pinned = Boolean(req.stopIds);

  // shared link: load exactly these stops, in this order
  if (req.stopIds) {
    const ids = req.stopIds;
    const placeIds = ids.filter((id) => !id.startsWith("event/"));
    const eventIds = ids.filter((id) => id.startsWith("event/")).map((id) => id.slice(6));

    const places = placeIds.length
      ? await withFallback(deps, (p) => p.byIds(placeIds))
      : { items: [] as Poi[], usedFallback: false };
    let events: EventItem[] = [];
    if (eventIds.length && deps.events) {
      events = await deps.events.byIds(eventIds).catch(() => []);
    }
    // ended or cancelled events just drop out
    if (events.length < eventIds.length) warnings.push("EVENT_UNAVAILABLE");

    if (places.items.length === placeIds.length) {
      const byId = new Map<string, Stop>([
        ...places.items.map((p) => [p.id, p] as const),
        ...events.map((e) => [`event/${e.id}`, eventStop(e)] as const),
      ]);
      stops = ids.flatMap((id) => byId.get(id) ?? []);
      if (places.usedFallback && deps.pois.name !== "fixture") warnings.push("FALLBACK_POIS");
    } else {
      warnings.push("PINNED_MISSING");
    }
  }

  // otherwise plan from scratch
  if (!stops) {
    const query = {
      center: req.start,
      radiusMeters: searchRadius(req.durationMinutes),
      categories: themeCategories(req.theme),
    };
    const { items, usedFallback, liveFailed } = await withFallback(deps, (p) => p.search(query));
    if (liveFailed && !usedFallback) {
      throw new RouteError("POI_UNAVAILABLE", "The place data service did not respond.");
    }
    if (usedFallback) {
      if (items.length === 0) {
        throw new RouteError(
          "POI_UNAVAILABLE",
          "The place data service did not respond and this location is outside the bundled sample data.",
        );
      }
      warnings.push("FALLBACK_POIS");
    }
    const plan = planRoute(items, { ...req, seed: req.seed });
    stops = plan.stops;
    warnings.push(...plan.warnings);
  }

  if (stops.length < (pinned ? 1 : MIN_STOPS)) {
    throw new RouteError("NO_RESULTS", "Not enough places were found near this start.");
  }

  // Real walking path. If it blows the detour limit, drop the costliest stop and
  // retry (max 3 routing calls). Pinned stops are never dropped, and a date route
  // only loses middle stops.
  const mayTrim = !pinned;
  const trim = (list: Stop[]): Stop[] =>
    req.theme === "date" && list.length > 2
      ? [list[0], ...dropCostliestStop(list[0], list.slice(1, -1)), list[list.length - 1]]
      : orderStops(req.start, dropCostliestStop(req.start, list));
  let path: RoutedPath | null = null;
  if (deps.routing) {
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        path = await deps.routing.walk([req.start, ...stops]);
        const tooLong = path.distanceMeters > target * MAX_DETOUR_FACTOR;
        if (!tooLong || !mayTrim || stops.length <= (req.theme === "date" ? 3 : MIN_STOPS) || attempt === 2) break;
        stops = trim(stops);
        if (attempt === 0) warnings.push("DETOUR_TRIMMED");
      }
    } catch {
      path = null;
      warnings.push("STRAIGHT_LINES");
    }
  }
  if (!deps.routing) warnings.push("OFFLINE");
  path ??= straightPath([req.start, ...stops]);
  if (path.distanceMeters > target * MAX_DETOUR_FACTOR) {
    warnings.push("LONGER_THAN_TARGET");
  }

  const routeId = createHash("sha1")
    .update(
      JSON.stringify([
        roundCoord(req.start.lat),
        roundCoord(req.start.lng),
        req.durationMinutes,
        req.theme,
        stops.map((s) => s.id),
      ]),
    )
    .digest("hex")
    .slice(0, 12);

  return {
    routeId,
    summary: {
      distanceMeters: Math.round(path.distanceMeters),
      durationMinutes: walkMinutes(path.distanceMeters),
      stopCount: stops.length,
    },
    stops: stops.map(toStop),
    geometry: path.geometry,
    warnings: [...new Set(warnings)],
  };
}
