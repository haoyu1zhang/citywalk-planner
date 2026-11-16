import { createHash } from "node:crypto";
import { z } from "zod";
import type { EventItem, LatLng } from "@/types";

// E-zine events API, https://e-zine.it/it/api/
// Only used by scripts/update-events.ts; the app reads data/events.json.

export const EZINE_API = "https://e-zine.it/wp-json/ez/v1/events";

const rawSchema = z.object({
  title: z.string(),
  address: z.string(),
  start_time: z.string().nullish(),
  event_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  event_end_date: z.string().nullish(),
});
export type EzineEvent = z.infer<typeof rawSchema>;

export function parseEzine(raw: unknown): EzineEvent[] {
  const list = z.object({ events: z.array(z.unknown()) }).parse(raw).events;
  return list.flatMap((item) => {
    const ev = rawSchema.safeParse(item);
    return ev.success && ev.data.title.trim() && ev.data.address.trim() ? [ev.data] : [];
  });
}

// the API has no ids, so derive a stable one
export function ezineId(city: string, ev: EzineEvent): string {
  const key = [city, ev.title.trim(), ev.address.trim(), ev.event_start_date].join("|");
  return `ez${createHash("sha1").update(key).digest("hex").slice(0, 10)}`;
}

export function toEvent(city: string, ev: EzineEvent, point: LatLng): EventItem {
  const title = ev.title.trim();
  const time = ev.start_time?.slice(0, 5);
  const end = ev.event_end_date ?? ev.event_start_date;
  return {
    id: ezineId(city, ev),
    name: title,
    url: `https://e-zine.it/?s=${encodeURIComponent(title)}`,
    // 00:00 means "no time given"
    startsAt: time && time !== "00:00" ? `${ev.event_start_date}T${time}` : ev.event_start_date,
    ...(end > ev.event_start_date ? { endsAt: end } : {}),
    category: "arts",
    venue: ev.address.trim().replace(/[\s,·-]+$/, ""),
    lat: point.lat,
    lng: point.lng,
    source: "ezine",
  };
}
