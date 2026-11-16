import { roundCoord } from "@/lib/geo";
import { routeRequestSchema } from "@/lib/schemas";
import type { RouteRequest } from "@/types";

// URL shape: /route?city=rome&lat=41.8986&lng=12.4769&d=60&theme=coffee
//            &seed=1&stops=n123,w456
// `stops` pins the exact stops, so a shared link shows the same route even if
// OSM data or the scoring changes later.

// Events added to the route travel in the same list with an "e" prefix.

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
  // Commas are legal in a query string; keeping them makes the link readable.
  return params.toString().replaceAll("%2C", ",");
}

/** Returns null for anything that is not a valid route link. */
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
