import { z } from "zod";
import { fetchJson, HttpError } from "@/lib/http";
import type { EventItem } from "@/types";
import type { EventProvider, EventQuery } from "./types";

// Ticketmaster Discovery API v2. Needs TICKETMASTER_API_KEY (free tier: 5000 calls/day).

const BASE = "https://app.ticketmaster.com/discovery/v2";

// venue coordinates come as strings
const rawEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
  dates: z.object({
    start: z.object({ localDate: z.string().optional(), localTime: z.string().optional() }),
  }),
  classifications: z.array(z.object({ segment: z.object({ name: z.string() }).optional() })).optional(),
  priceRanges: z.array(z.object({ min: z.number().optional(), currency: z.string().optional() })).optional(),
  _embedded: z.object({
    venues: z
      .array(
        z.object({
          name: z.string().optional(),
          location: z.object({ latitude: z.coerce.number(), longitude: z.coerce.number() }).optional(),
        }),
      )
      .min(1),
  }),
});
const responseSchema = z.object({
  _embedded: z.object({ events: z.array(z.unknown()) }).optional(),
});

const SEGMENT_TO_CATEGORY: Record<string, EventItem["category"]> = {
  Music: "music",
  "Arts & Theatre": "arts",
  Sports: "sports",
  Film: "film",
  Family: "family",
};
const CATEGORY_TO_SEGMENT: Partial<Record<EventItem["category"], string>> = {
  music: "Music",
  arts: "Arts & Theatre",
  sports: "Sports",
  film: "Film",
  family: "Family",
};

export function parseTicketmaster(raw: unknown): EventItem[] {
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) throw new HttpError("unexpected Ticketmaster response shape", "parse");
  const events: EventItem[] = [];
  const seen = new Set<string>();
  for (const item of parsed.data._embedded?.events ?? []) {
    const ev = rawEventSchema.safeParse(item);
    if (!ev.success) continue;
    const venue = ev.data._embedded.venues[0];
    const { localDate, localTime } = ev.data.dates.start;
    if (!venue.location || !localDate || !/^[A-Za-z0-9_-]{1,40}$/.test(ev.data.id)) continue;
    if (venue.location.latitude === 0 && venue.location.longitude === 0) continue;
    // same show, one listing per ticket type
    const key = `${ev.data.name}|${localDate}|${localTime ?? ""}|${venue.name ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const segment = ev.data.classifications?.[0]?.segment?.name ?? "";
    const price = ev.data.priceRanges?.find((p) => p.min !== undefined);
    events.push({
      id: ev.data.id,
      name: ev.data.name,
      url: ev.data.url,
      startsAt: localTime ? `${localDate}T${localTime.slice(0, 5)}` : localDate,
      category: SEGMENT_TO_CATEGORY[segment] ?? "other",
      venue: venue.name ?? "",
      lat: venue.location.latitude,
      lng: venue.location.longitude,
      ...(price?.min !== undefined ? { priceFrom: price.min, currency: price.currency } : {}),
      source: "ticketmaster",
    });
  }
  return events;
}

const GEOHASH_ALPHABET = "0123456789bcdefghjkmnpqrstuvwxyz";

/** Standard geohash; Discovery's `geoPoint` filter takes one (max 9 chars). */
export function geohash(lat: number, lng: number, precision = 7): string {
  let latRange: [number, number] = [-90, 90];
  let lngRange: [number, number] = [-180, 180];
  let hash = "";
  let bits = 0;
  let value = 0;
  let even = true;
  while (hash.length < precision) {
    const range = even ? lngRange : latRange;
    const coord = even ? lng : lat;
    const mid = (range[0] + range[1]) / 2;
    if (coord >= mid) {
      value = value * 2 + 1;
      range[0] = mid;
    } else {
      value *= 2;
      range[1] = mid;
    }
    if (even) lngRange = range;
    else latRange = range;
    even = !even;
    if (++bits === 5) {
      hash += GEOHASH_ALPHABET[value];
      bits = 0;
      value = 0;
    }
  }
  return hash;
}

export function buildSearchUrl(query: EventQuery, apiKey: string): string {
  const params = new URLSearchParams({
    apikey: apiKey,
    geoPoint: geohash(query.center.lat, query.center.lng),
    radius: String(Math.round(query.radiusKm)),
    unit: "km",
    // UTC day boundaries, close enough for Italy
    startDateTime: `${query.from}T00:00:00Z`,
    endDateTime: `${query.to}T23:59:59Z`,
    sort: "date,asc",
    size: "60",
    locale: "*",
  });
  if (query.keyword) params.set("keyword", query.keyword);
  const segment = query.category && CATEGORY_TO_SEGMENT[query.category];
  if (segment) params.set("classificationName", segment);
  return `${BASE}/events.json?${params}`;
}

export function createTicketmasterProvider(
  apiKey: string | undefined = process.env.TICKETMASTER_API_KEY,
): EventProvider | null {
  if (!apiKey) return null;
  return {
    name: "ticketmaster",
    async search(query) {
      const url = buildSearchUrl(query, apiKey);
      const raw = await fetchJson(url, {
        timeoutMs: 6000,
        retries: 1,
        // keep the api key out of the cache key
        cacheKey: `tm:${url.replace(apiKey, "")}`,
        cacheTtlMs: 15 * 60_000,
      });
      const events = parseTicketmaster(raw);
      return query.category === "other" ? events.filter((e) => e.category === "other") : events;
    },
    async byIds(ids) {
      if (ids.length === 0) return [];
      const sorted = [...ids].sort();
      const params = new URLSearchParams({ apikey: apiKey, id: sorted.join(","), locale: "*", size: "50" });
      const raw = await fetchJson(`${BASE}/events.json?${params}`, {
        timeoutMs: 6000,
        retries: 1,
        cacheKey: `tm:ids:${sorted.join(",")}`,
        cacheTtlMs: 15 * 60_000,
      });
      const found = new Map(parseTicketmaster(raw).map((e) => [e.id, e]));
      return ids.flatMap((id) => found.get(id) ?? []);
    },
  };
}
