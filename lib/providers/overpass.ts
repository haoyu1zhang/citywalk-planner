import { z } from "zod";
import { roundCoord } from "@/lib/geo";
import { fetchJson, HttpError } from "@/lib/http";
import { CATEGORY_FILTERS, categoryFromTags } from "@/lib/themes";
import type { Poi } from "@/types";
import type { PoiProvider, PoiQuery } from "./types";

const elementSchema = z.object({
  type: z.enum(["node", "way", "relation"]),
  id: z.number(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  tags: z.record(z.string(), z.string()).optional(),
});
const responseSchema = z.object({ elements: z.array(z.unknown()) });

export function parseOverpass(raw: unknown): Poi[] {
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) throw new HttpError("unexpected Overpass response shape", "parse");
  const pois: Poi[] = [];
  for (const item of parsed.data.elements) {
    const el = elementSchema.safeParse(item);
    if (!el.success) continue;
    const { type, id, tags = {} } = el.data;
    const lat = el.data.lat ?? el.data.center?.lat;
    const lng = el.data.lon ?? el.data.center?.lon;
    const name = tags.name?.trim();
    const category = categoryFromTags(tags);
    if (lat === undefined || lng === undefined || !name || !category) continue;
    pois.push({ id: `${type}/${id}`, name, category, lat, lng, tagCount: Object.keys(tags).length });
  }
  return pois;
}

export function buildSearchQuery({ center, radiusMeters, categories }: PoiQuery): string {
  const around = `(around:${Math.round(radiusMeters)},${center.lat},${center.lng})`;
  const parts = categories.map((c) => `nwr${CATEGORY_FILTERS[c]}["name"]${around};`);
  return `[out:json][timeout:8];(${parts.join("")});out center tags 400;`;
}

export function buildIdQuery(ids: string[]): string {
  const byType = (t: string) =>
    ids.filter((id) => id.startsWith(`${t}/`)).map((id) => id.split("/")[1]);
  const parts = ["node", "way", "relation"]
    .map((t) => [t, byType(t)] as const)
    .filter(([, list]) => list.length > 0)
    .map(([t, list]) => `${t}(id:${list.join(",")});`);
  return `[out:json][timeout:8];(${parts.join("")});out center tags;`;
}

const DEFAULT_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

export function createOverpassProvider(
  endpoints: string[] = process.env.OVERPASS_URLS?.split(",").map((s) => s.trim()).filter(Boolean) ??
    DEFAULT_ENDPOINTS,
): PoiProvider {
  // one attempt per mirror, then give up: the caller falls back to fixtures
  async function run(query: string): Promise<Poi[]> {
    let lastError: unknown;
    for (const endpoint of endpoints) {
      try {
        const raw = await fetchJson(endpoint, {
          method: "POST",
          body: `data=${encodeURIComponent(query)}`,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeoutMs: 8000,
          cacheKey: `overpass:${query}`,
          cacheTtlMs: 30 * 60_000,
        });
        return parseOverpass(raw);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError ?? new HttpError("no Overpass endpoint configured", "network");
  }

  return {
    name: "overpass",
    search(query) {
      // snap to ~100 m so nearby starts share a cache entry
      const center = { lat: roundCoord(query.center.lat, 3), lng: roundCoord(query.center.lng, 3) };
      return run(buildSearchQuery({ ...query, center }));
    },
    async byIds(ids) {
      const found = await run(buildIdQuery([...ids].sort()));
      const map = new Map(found.map((p) => [p.id, p]));
      return ids.flatMap((id) => map.get(id) ?? []);
    },
  };
}
