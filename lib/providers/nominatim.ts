import { z } from "zod";
import { fetchJson } from "@/lib/http";
import type { GeocodeResult } from "@/lib/schemas";
import { categoryFromTags } from "@/lib/themes";
import type { Poi } from "@/types";

const BASE = process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org";
const DAY = 24 * 60 * 60_000;

// Nominatim policy: identify yourself, cache, 1 req/s, no autocomplete

const searchSchema = z.array(
  z.object({ name: z.string().optional(), display_name: z.string(), lat: z.string(), lon: z.string() }),
);

export interface GeocodeOptions {
  /** "city" limits results to towns and cities. */
  kind?: "city";
  /** accept-language value, e.g. "zh" */
  lang?: string;
}

export async function geocode(q: string, { kind, lang = "en" }: GeocodeOptions = {}): Promise<GeocodeResult[]> {
  const query = q.trim().toLowerCase();
  const params = new URLSearchParams({ format: "jsonv2", limit: "5", "accept-language": lang, q: query });
  if (kind === "city") params.set("featureType", "settlement");
  const url = `${BASE}/search?${params}`;
  const raw = await fetchJson(url, { timeoutMs: 6000, cacheKey: `nominatim:${url}`, cacheTtlMs: DAY });
  return searchSchema.parse(raw).map((r) => ({
    // for cities the short name reads better; the full one goes in `label`
    name: kind === "city" && r.name ? r.name : r.display_name,
    label: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
  }));
}

const reverseSchema = z.object({
  name: z.string().optional(),
  lat: z.string(),
  lon: z.string(),
  address: z.record(z.string(), z.string()).optional(),
});

/** Name of the town or city at a point, for "use my location". */
export async function reverseCity(lat: number, lng: number, lang = "en"): Promise<GeocodeResult | null> {
  const params = new URLSearchParams({
    format: "jsonv2",
    zoom: "10",
    lat: lat.toFixed(3),
    lon: lng.toFixed(3),
    "accept-language": lang,
  });
  const url = `${BASE}/reverse?${params}`;
  const raw = await fetchJson(url, { timeoutMs: 6000, cacheKey: `nominatim:${url}`, cacheTtlMs: DAY });
  const parsed = reverseSchema.safeParse(raw);
  if (!parsed.success) return null;
  const a = parsed.data.address ?? {};
  const name = a.city ?? a.town ?? a.village ?? a.municipality ?? parsed.data.name;
  if (!name) return null;
  return { name, label: [name, a.country].filter(Boolean).join(", "), lat, lng };
}

const lookupSchema = z.array(
  z.object({
    osm_type: z.enum(["node", "way", "relation"]),
    osm_id: z.number(),
    category: z.string(),
    type: z.string(),
    name: z.string().optional(),
    namedetails: z.record(z.string(), z.string()).nullish(),
    lat: z.string(),
    lon: z.string(),
  }),
);

/** OSM elements by id ("node/123"), in the order asked. Used to reopen shared links. */
export async function lookupPlaces(ids: string[]): Promise<Poi[]> {
  if (ids.length === 0) return [];
  const short = ids.map((id) => `${id[0].toUpperCase()}${id.split("/")[1]}`);
  // namedetails gives the plain `name` tag instead of a translated one
  const url = `${BASE}/lookup?format=jsonv2&namedetails=1&osm_ids=${[...short].sort().join(",")}`;
  const raw = await fetchJson(url, { timeoutMs: 6000, retries: 1, cacheKey: `nominatim:${url}`, cacheTtlMs: DAY });
  const found = new Map<string, Poi>();
  for (const r of lookupSchema.parse(raw)) {
    const category = categoryFromTags({ [r.category]: r.type });
    const name = (r.namedetails?.name ?? r.name)?.trim();
    if (!category || !name) continue;
    const id = `${r.osm_type}/${r.osm_id}`;
    found.set(id, { id, name, category, lat: Number(r.lat), lng: Number(r.lon), tagCount: 5 });
  }
  return ids.flatMap((id) => found.get(id) ?? []);
}
