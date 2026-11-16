// Regenerates lib/fixtures/*.json from live Overpass data.
//   npm run fixtures            (all preset cities)
//   npm run fixtures -- rome    (one city)
//
// For each category it keeps the best-tagged named places within RADIUS of the
// city centre, so the offline demo has a small but representative sample.

import { writeFileSync } from "node:fs";
import path from "node:path";
import { CITIES } from "../lib/cities";
import { haversine } from "../lib/geo";
import { USER_AGENT } from "../lib/http";
import { buildSearchQuery, parseOverpass } from "../lib/providers/overpass";
import { CATEGORIES } from "../lib/themes";
import type { Category, Poi } from "../types";

const RADIUS = 1800;
const MIN_SPACING = 120;
const KEEP: Record<Category, number> = {
  cafe: 10, park: 6, bookshop: 4, library: 2, art_gallery: 4, viewpoint: 4, attraction: 6, museum: 5, historic: 5, ice_cream: 4, restaurant: 6, bar: 4,
};
const ENDPOINT = process.env.OVERPASS_URLS?.split(",")[0] ?? "https://overpass-api.de/api/interpreter";

async function build(cityId: string) {
  const city = CITIES.find((c) => c.id === cityId);
  if (!city) throw new Error(`unknown city: ${cityId}`);
  const query = buildSearchQuery({ center: city.center, radiusMeters: RADIUS, categories: [...CATEGORIES] })
    .replace("[timeout:8]", "[timeout:60]")
    .replace("out center tags 400;", "out center tags 2000;");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    body: `data=${encodeURIComponent(query)}`,
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`${cityId}: HTTP ${res.status}`);
  const all = parseOverpass(await res.json());

  const kept: Poi[] = [];
  const names = new Set<string>();
  for (const category of CATEGORIES) {
    const pool = all.filter((p) => p.category === category).sort((a, b) => b.tagCount - a.tagCount);
    const picked: Poi[] = [];
    for (const poi of pool) {
      if (picked.length >= KEEP[category]) break;
      if (names.has(poi.name.toLowerCase())) continue;
      if (picked.some((p) => haversine(p, poi) < MIN_SPACING)) continue;
      names.add(poi.name.toLowerCase());
      picked.push({ ...poi, lat: +poi.lat.toFixed(5), lng: +poi.lng.toFixed(5) });
    }
    kept.push(...picked);
  }
  const file = path.join(import.meta.dirname, "..", "lib", "fixtures", `${cityId}.json`);
  writeFileSync(file, `[\n${kept.map((p) => `  ${JSON.stringify(p)}`).join(",\n")}\n]\n`);
  console.log(`${cityId}: ${all.length} places found, ${kept.length} kept`);
}

async function main() {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : CITIES.map((c) => c.id);
  for (const id of ids) {
    await build(id);
    await new Promise((r) => setTimeout(r, 3000)); // be polite to the public server
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
