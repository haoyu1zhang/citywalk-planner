import { NextResponse } from "next/server";
import { z } from "zod";
import { haversine } from "@/lib/geo";
import { createFixtureProvider } from "@/lib/providers/fixtures";
import { createLivePoiProvider } from "@/lib/providers/live";
import { filterCandidates } from "@/lib/route/candidates";
import { searchRadius } from "@/lib/route/plan";
import { decodeStopIds } from "@/lib/share";
import { DURATIONS, THEMES, themeCategories } from "@/lib/themes";
import type { Poi } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 20;

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  d: z.coerce.number().refine((n): n is (typeof DURATIONS)[number] => (DURATIONS as readonly number[]).includes(n)),
  theme: z.enum(THEMES),
  exclude: z.string().max(400).optional(),
  n: z.coerce.number().int().min(2).max(12).default(8),
});

const offline = process.env.CITYWALK_OFFLINE === "1";
const fixtures = createFixtureProvider();
const live = offline ? null : createLivePoiProvider();

function sample<T>(items: T[], n: number): T[] {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Invalid query." } }, { status: 400 });
  }
  const { lat, lng, d, theme, exclude, n } = parsed.data;
  const start = { lat, lng };
  const query = { center: start, radiusMeters: searchRadius(d), categories: themeCategories(theme) };

  let pois: Poi[];
  try {
    pois = live ? await live.search(query) : await fixtures.search(query);
  } catch {
    pois = await fixtures.search(query);
  }

  const taken = new Set(exclude ? decodeStopIds(exclude) : []);
  const places = sample(
    filterCandidates(pois, start, query.radiusMeters, query.categories).filter(
      (p) => !taken.has(p.id) && haversine(start, p) > 60,
    ),
    n,
  ).map(({ id, name, category, lat, lng }) => ({ id, name, category, lat, lng }));

  return NextResponse.json({ places }, { headers: { "Cache-Control": "no-store" } });
}
