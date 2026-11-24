import { z } from "zod";
import { roundCoord } from "@/lib/geo";
import { fetchJson, HttpError } from "@/lib/http";
import { categoryFromTags } from "@/lib/themes";
import type { Category, LatLng, Poi } from "@/types";
import { lookupPlaces } from "./nominatim";
import type { PoiProvider, PoiQuery } from "./types";

// Photon (komoot) reverse search with osm_tag filters. Returns at most 50
// features per request, nearest first, so dense categories (cafés, bars...)
// would all come from the first few hundred metres. To get some spread there
// are four extra requests around the start that ask for every category at once.

const BASE = process.env.PHOTON_URL ?? "https://photon.komoot.io";
const LIMIT = 50;

const TAGS: Record<Category, string[]> = {
  cafe: ["amenity:cafe"],
  park: ["leisure:park", "leisure:garden"],
  bookshop: ["shop:books"],
  library: ["amenity:library"],
  art_gallery: ["tourism:gallery"],
  viewpoint: ["tourism:viewpoint"],
  attraction: ["tourism:attraction"],
  museum: ["tourism:museum"],
  historic: ["historic"],
  ice_cream: ["amenity:ice_cream"],
  restaurant: ["amenity:restaurant"],
  bar: ["amenity:bar"],
};
// same filter as the Overpass query
const HISTORIC = /^(monument|memorial|castle|ruins|archaeological_site|church|fountain)$/;
const OSM_TYPE = { N: "node", W: "way", R: "relation" } as const;

const featureSchema = z.object({
  geometry: z.object({ type: z.literal("Point"), coordinates: z.tuple([z.number(), z.number()]) }),
  properties: z
    .object({
      osm_type: z.enum(["N", "W", "R"]),
      osm_id: z.number(),
      osm_key: z.string(),
      osm_value: z.string(),
      name: z.string().optional(),
    })
    .passthrough(),
});
const responseSchema = z.object({ features: z.array(z.unknown()) });

export function parsePhoton(raw: unknown): Poi[] {
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) throw new HttpError("unexpected Photon response", "parse");
  const pois: Poi[] = [];
  for (const item of parsed.data.features) {
    const f = featureSchema.safeParse(item);
    if (!f.success) continue;
    const { osm_type, osm_id, osm_key, osm_value } = f.data.properties;
    const name = f.data.properties.name?.trim();
    if (!name) continue;
    if (osm_key === "historic" && !HISTORIC.test(osm_value)) continue;
    const category = categoryFromTags({ [osm_key]: osm_value });
    if (!category) continue;
    const [lng, lat] = f.data.geometry.coordinates;
    pois.push({
      id: `${OSM_TYPE[osm_type]}/${osm_id}`,
      name,
      category,
      lat,
      lng,
      // Photon doesn't expose the tag list; the number of address fields is a rough stand-in
      tagCount: Object.keys(f.data.properties).length,
    });
  }
  return pois;
}

export function reverseUrl(point: LatLng, radiusKm: number, tags: string[]): string {
  const params = new URLSearchParams({
    lat: String(roundCoord(point.lat, 4)),
    lon: String(roundCoord(point.lng, 4)),
    radius: radiusKm.toFixed(2),
    limit: String(LIMIT),
  });
  for (const tag of tags) params.append("osm_tag", tag);
  return `${BASE}/reverse?${params}`;
}

/** Points north, east, south and west of `center`, `meters` away. */
export function ringPoints(center: LatLng, meters: number): LatLng[] {
  const dLat = meters / 111_320;
  const dLng = meters / (111_320 * Math.cos((center.lat * Math.PI) / 180));
  return [
    { lat: center.lat + dLat, lng: center.lng },
    { lat: center.lat, lng: center.lng + dLng },
    { lat: center.lat - dLat, lng: center.lng },
    { lat: center.lat, lng: center.lng - dLng },
  ];
}

async function inBatches<T>(tasks: (() => Promise<T>)[], size: number): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < tasks.length; i += size) {
    results.push(...(await Promise.allSettled(tasks.slice(i, i + size).map((run) => run()))));
  }
  return results;
}

export function createPhotonProvider(): PoiProvider {
  async function get(url: string): Promise<Poi[]> {
    const raw = await fetchJson(url, {
      timeoutMs: 5000,
      cacheKey: `photon:${url}`,
      cacheTtlMs: 30 * 60_000,
    });
    return parsePhoton(raw);
  }

  return {
    name: "photon",
    async search({ center, radiusMeters, categories }: PoiQuery) {
      const c = { lat: roundCoord(center.lat, 3), lng: roundCoord(center.lng, 3) };
      const km = radiusMeters / 1000;
      const urls = [
        ...categories.map((cat) => reverseUrl(c, km, TAGS[cat])),
        ...ringPoints(c, radiusMeters * 0.55).map((p) =>
          reverseUrl(p, km / 2, categories.flatMap((cat) => TAGS[cat])),
        ),
      ];
      const results = await inBatches(
        urls.map((url) => () => get(url)),
        4,
      );
      if (results.every((r) => r.status === "rejected")) {
        throw new HttpError("Photon did not respond", "network");
      }
      const byId = new Map<string, Poi>();
      for (const r of results) {
        if (r.status !== "fulfilled") continue;
        for (const poi of r.value) {
          if (categories.includes(poi.category)) byId.set(poi.id, poi);
        }
      }
      return [...byId.values()];
    },
    byIds: (ids) => lookupPlaces(ids),
  };
}
