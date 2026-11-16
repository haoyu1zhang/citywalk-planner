// Refreshes data/events.json from the E-zine events API (https://e-zine.it/it/api/).
//
//   npm run events                 next 14 days
//   npm run events -- --backfill   also the last 30 days, to pick up exhibitions
//                                  that opened earlier and are still running
//
// The API only returns a street address, so each new address is geocoded with
// Nominatim (1 request per second, per their usage policy). Events already in
// the snapshot are kept and not geocoded again.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { CITIES } from "../lib/cities";
import { haversine } from "../lib/geo";
import { USER_AGENT } from "../lib/http";
import { EZINE_API, ezineId, parseEzine, toEvent, type EzineEvent } from "../lib/providers/ezine";
import type { EventItem } from "../types";

const FILE = path.join(import.meta.dirname, "..", "data", "events.json");
const NOMINATIM = process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org";
const DAYS_AHEAD = 14;
const DAYS_BACK = 30;
/** A geocoding hit further than this from the city centre is the wrong street. */
const MAX_KM_FROM_CENTRE = 10;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function geocode(address: string, city: (typeof CITIES)[number]) {
  const q = encodeURIComponent(`${address}, ${city.query}, Italia`);
  const raw = await getJson(`${NOMINATIM}/search?format=jsonv2&limit=1&countrycodes=it&q=${q}`);
  const hit = z.array(z.object({ lat: z.string(), lon: z.string() })).parse(raw)[0];
  if (!hit) return null;
  const point = { lat: +(+hit.lat).toFixed(5), lng: +(+hit.lon).toFixed(5) };
  return haversine(point, city.center) <= MAX_KM_FROM_CENTRE * 1000 ? point : null;
}

async function main() {
  const backfill = process.argv.includes("--backfill");
  const today = iso(new Date());
  const previous: EventItem[] = JSON.parse(readFileSync(FILE, "utf8")).events;
  const known = new Map(previous.map((e) => [e.id, e]));
  let added = 0;

  for (const city of CITIES) {
    for (let offset = backfill ? -DAYS_BACK : 0; offset <= DAYS_AHEAD; offset++) {
      const date = iso(new Date(Date.now() + offset * 86_400_000));
      let listed: EzineEvent[];
      try {
        const url = `${EZINE_API}?date=${date}&city=${encodeURIComponent(city.query)}&lang=it`;
        listed = parseEzine(await getJson(url));
      } catch (err) {
        console.warn(`skip ${city.id} ${date}: ${err instanceof Error ? err.message : err}`);
        continue;
      } finally {
        await sleep(400);
      }

      for (const raw of listed) {
        const id = ezineId(city.id, raw);
        if (known.has(id)) continue;
        const point = await geocode(raw.address.trim(), city).catch(() => null);
        await sleep(1100);
        if (!point) {
          console.warn(`no location for "${raw.address.trim()}" (${city.id})`);
          continue;
        }
        known.set(id, toEvent(city.id, raw, point));
        added++;
      }
    }
  }

  // drop what is over
  const events = [...known.values()]
    .filter((e) => (e.endsAt ?? e.startsAt.slice(0, 10)) >= today)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));

  const unchanged =
    events.length === previous.length && events.every((e, i) => e.id === previous[i]?.id);
  if (unchanged) {
    console.log("events: nothing new");
    return;
  }
  const body = events.map((e) => `    ${JSON.stringify(e)}`).join(",\n");
  writeFileSync(FILE, `{\n  "updatedAt": "${today}",\n  "events": [\n${body}\n  ]\n}\n`);
  console.log(`events: ${added} added, ${events.length} total`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
