import { NextResponse } from "next/server";
import { z } from "zod";
import { LOCALES } from "@/lib/i18n";
import { geocode, reverseCity } from "@/lib/providers/nominatim";

export const runtime = "nodejs";

const querySchema = z.union([
  z.object({
    q: z.string().trim().min(2).max(120),
    kind: z.literal("city").optional(),
    lang: z.enum(LOCALES).default("en"),
  }),
  z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    lang: z.enum(LOCALES).default("en"),
  }),
]);

const CACHE = { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" };

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ results: [] }, { status: 400 });
  if (process.env.CITYWALK_OFFLINE === "1") return NextResponse.json({ results: [] });

  try {
    const query = parsed.data;
    if ("q" in query) {
      return NextResponse.json({ results: await geocode(query.q, { kind: query.kind, lang: query.lang }) }, { headers: CACHE });
    }
    const city = await reverseCity(query.lat, query.lng, query.lang);
    return NextResponse.json({ results: city ? [city] : [] }, { headers: CACHE });
  } catch {
    return NextResponse.json(
      { results: [], error: { code: "POI_UNAVAILABLE", message: "Geocoding is unavailable." } },
      { status: 502 },
    );
  }
}
