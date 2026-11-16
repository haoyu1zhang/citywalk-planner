import { z } from "zod";
import { CITIES } from "@/lib/cities";
import { haversine } from "@/lib/geo";
import { poiSchema } from "@/lib/schemas";
import type { LatLng, Poi } from "@/types";
import type { PoiProvider } from "./types";

import bologna from "@/lib/fixtures/bologna.json";
import florence from "@/lib/fixtures/florence.json";
import milan from "@/lib/fixtures/milan.json";
import rome from "@/lib/fixtures/rome.json";
import venice from "@/lib/fixtures/venice.json";

// Snapshots of real Overpass results (see scripts/build-fixtures.ts). They are
// validated like any other external data.
const RAW: Record<string, unknown> = { rome, florence, milan, venice, bologna };
const parsed = new Map<string, Poi[]>();

function load(cityId: string): Poi[] {
  let pois = parsed.get(cityId);
  if (!pois) {
    pois = z.array(poiSchema).parse(RAW[cityId] ?? []);
    parsed.set(cityId, pois);
  }
  return pois;
}

/** Fixtures only cover the preset city centres. */
const COVERAGE_METERS = 6000;

export function fixtureCityFor(point: LatLng): string | null {
  let best: { id: string; d: number } | null = null;
  for (const c of CITIES) {
    const d = haversine(point, c.center);
    if (d <= COVERAGE_METERS && (!best || d < best.d)) best = { id: c.id, d };
  }
  return best?.id ?? null;
}

export function createFixtureProvider(): PoiProvider {
  return {
    name: "fixture",
    async search({ center, radiusMeters, categories }) {
      const city = fixtureCityFor(center);
      if (!city) return [];
      return load(city).filter(
        (p) => categories.includes(p.category) && haversine(center, p) <= radiusMeters,
      );
    },
    async byIds(ids) {
      const all = new Map(CITIES.flatMap((c) => load(c.id)).map((p) => [p.id, p]));
      return ids.flatMap((id) => all.get(id) ?? []);
    },
  };
}
