import { roundCoord } from "@/lib/geo";
import { routeRequestSchema } from "@/lib/schemas";
import type { LatLng, RouteRequest } from "@/types";

// /route?city=rome&lat=41.8986&lng=12.4769&d=60&theme=coffee&seed=1&stops=n123,w456,eABC
// stops = OSM ids (n/w/r) and events (e), so a shared link reproduces the same route

const PREFIX: Record<string, string> = { node: "n", way: "w", relation: "r", event: "e" };
const TYPE: Record<string, string> = { n: "node", w: "way", r: "relation", e: "event" };

export function encodeStopIds(ids: string[]): string {
  return ids.map((id) => `${PREFIX[id.split("/")[0]]}${id.split("/")[1]}`).join(",");
}

export function decodeStopIds(value: string): string[] {
  return value
    .split(",")
    .filter(Boolean)
    .map((token) => `${TYPE[token[0]] ?? "?"}/${token.slice(1)}`);
}

export function encodeRouteParams(req: RouteRequest): string {
  const params = new URLSearchParams({
    city: req.city,
    lat: String(roundCoord(req.start.lat)),
    lng: String(roundCoord(req.start.lng)),
    d: String(req.durationMinutes),
    theme: req.theme,
  });
  if (req.seed) params.set("seed", String(req.seed));
  if (req.stopIds?.length) params.set("stops", encodeStopIds(req.stopIds));
  // keep commas readable
  return params.toString().replaceAll("%2C", ",");
}

export function decodeRouteParams(params: URLSearchParams): RouteRequest | null {
  const stops = params.get("stops");
  const seed = params.get("seed");
  const result = routeRequestSchema.safeParse({
    city: params.get("city") ?? "",
    start: { lat: Number(params.get("lat") ?? NaN), lng: Number(params.get("lng") ?? NaN) },
    durationMinutes: Number(params.get("d")),
    theme: params.get("theme"),
    seed: seed ? Number(seed) : undefined,
    stopIds: stops ? decodeStopIds(stops) : undefined,
  });
  return result.success ? result.data : null;
}

// Google Maps takes at most 9 waypoints between origin and destination
// (3 in a mobile browser; the app handles 9).
const MAX_WAYPOINTS = 9;

export function googleMapsUrl(start: LatLng, stops: LatLng[]): string | null {
  if (stops.length === 0) return null;
  const point = (p: LatLng) => `${roundCoord(p.lat)},${roundCoord(p.lng)}`;
  const destination = stops[stops.length - 1];
  const waypoints = stops.slice(0, -1).slice(0, MAX_WAYPOINTS);
  const params = new URLSearchParams({
    api: "1",
    origin: point(start),
    destination: point(destination),
    travelmode: "walking",
  });
  if (waypoints.length) params.set("waypoints", waypoints.map(point).join("|"));
  return `https://www.google.com/maps/dir/?${params}`;
}
