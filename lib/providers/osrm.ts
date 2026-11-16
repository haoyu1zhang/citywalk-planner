import { z } from "zod";
import { fetchJson, HttpError } from "@/lib/http";
import { roundCoord } from "@/lib/geo";
import type { LatLng } from "@/types";
import type { RoutedPath, RoutingProvider } from "./types";

const responseSchema = z.object({
  code: z.string(),
  routes: z
    .array(
      z.object({
        distance: z.number(),
        geometry: z.object({
          type: z.literal("LineString"),
          coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
        }),
      }),
    )
    .min(1),
});

export function parseOsrm(raw: unknown): RoutedPath {
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success || parsed.data.code !== "Ok") {
    throw new HttpError("unexpected routing response", "parse");
  }
  const [route] = parsed.data.routes;
  return { geometry: route.geometry, distanceMeters: route.distance };
}

/** Public servers cap the number of waypoints per request. */
const MAX_WAYPOINTS = 25;

// The well-known router.project-osrm.org demo only serves the car profile, so
// the default is the FOSSGIS instance, which has a real pedestrian profile.
const DEFAULT_BASE = "https://routing.openstreetmap.de/routed-foot";

export function createOsrmProvider(
  baseUrl: string = process.env.OSRM_BASE_URL ?? DEFAULT_BASE,
  profile: string = process.env.OSRM_PROFILE ?? "foot",
): RoutingProvider {
  async function leg(points: LatLng[]): Promise<RoutedPath> {
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
    const url = `${baseUrl}/route/v1/${profile}/${coords}?overview=full&geometries=geojson`;
    const raw = await fetchJson(url, {
      timeoutMs: 5000,
      retries: 1,
      cacheKey: `osrm:${url}`,
      cacheTtlMs: 60 * 60_000,
    });
    return parseOsrm(raw);
  }

  return {
    name: "osrm",
    async walk(input) {
      // Round (stable cache keys) and drop consecutive duplicates.
      const points: LatLng[] = [];
      for (const p of input) {
        const q = { lat: roundCoord(p.lat), lng: roundCoord(p.lng) };
        const last = points[points.length - 1];
        if (!last || last.lat !== q.lat || last.lng !== q.lng) points.push(q);
      }
      if (points.length < 2) throw new HttpError("need at least two distinct points", "parse");

      // One request per route in practice; long routes are split into
      // overlapping batches that are fetched sequentially, never in parallel.
      const merged: RoutedPath = {
        geometry: { type: "LineString", coordinates: [] },
        distanceMeters: 0,
      };
      for (let i = 0; i < points.length - 1; i += MAX_WAYPOINTS - 1) {
        const part = await leg(points.slice(i, i + MAX_WAYPOINTS));
        const coords = merged.geometry.coordinates.length
          ? part.geometry.coordinates.slice(1)
          : part.geometry.coordinates;
        merged.geometry.coordinates.push(...coords);
        merged.distanceMeters += part.distanceMeters;
      }
      return merged;
    },
  };
}
