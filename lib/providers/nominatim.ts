import { z } from "zod";
import { fetchJson } from "@/lib/http";
import type { GeocodeResult } from "@/lib/schemas";

const responseSchema = z.array(
  z.object({ display_name: z.string(), lat: z.string(), lon: z.string() }),
);

const BASE = process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org";

// Nominatim policy: identify yourself, cache, 1 req/s, no autocomplete
export async function geocode(q: string): Promise<GeocodeResult[]> {
  const query = q.trim().toLowerCase();
  const url = `${BASE}/search?format=jsonv2&limit=5&accept-language=zh,it,en&q=${encodeURIComponent(query)}`;
  const raw = await fetchJson(url, {
    timeoutMs: 6000,
    cacheKey: `nominatim:${query}`,
    cacheTtlMs: 24 * 60 * 60_000,
  });
  return responseSchema.parse(raw).map((r) => ({
    name: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
  }));
}
