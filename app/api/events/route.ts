import { NextResponse } from "next/server";
import { z } from "zod";
import { createEventProvider } from "@/lib/providers/events";
import { EVENT_CATEGORIES } from "@/lib/themes";

export const runtime = "nodejs";

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  q: z.string().trim().max(80).optional(),
  category: z.enum(EVENT_CATEGORIES).optional(),
});

// venues are often outside the walkable centre
const RADIUS_KM = 8;
const provider = createEventProvider();

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Invalid query." } }, { status: 400 });
  }
  const { lat, lng, from, to, q, category } = parsed.data;
  try {
    const events = await provider.search({
      center: { lat, lng },
      radiusKm: RADIUS_KM,
      from,
      to,
      keyword: q || undefined,
      category,
    });
    return NextResponse.json(
      { events },
      { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } },
    );
  } catch {
    return NextResponse.json(
      { error: { code: "EVENTS_UNAVAILABLE", message: "No event source responded." } },
      { status: 502 },
    );
  }
}
