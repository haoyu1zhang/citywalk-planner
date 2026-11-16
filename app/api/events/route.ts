import { NextResponse } from "next/server";
import { z } from "zod";
import { createTicketmasterProvider } from "@/lib/providers/ticketmaster";
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

/** Venues are often outside the walkable centre, so search wider than a walk. */
const RADIUS_KM = 8;

export async function GET(request: Request) {
  const raw = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Invalid query." } }, { status: 400 });
  }
  const provider = process.env.CITYWALK_OFFLINE === "1" ? null : createTicketmasterProvider();
  if (!provider) return NextResponse.json({ configured: false, events: [] });

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
      { configured: true, events },
      { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } },
    );
  } catch {
    return NextResponse.json(
      { error: { code: "EVENTS_UNAVAILABLE", message: "The event provider did not respond." } },
      { status: 502 },
    );
  }
}
