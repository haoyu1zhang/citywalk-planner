import { NextResponse } from "next/server";
import { createFixtureProvider } from "@/lib/providers/fixtures";
import { createOsrmProvider } from "@/lib/providers/osrm";
import { createLivePoiProvider } from "@/lib/providers/live";
import { createEventProvider } from "@/lib/providers/events";
import { generateRoute, RouteError } from "@/lib/route/service";
import { routeRequestSchema, type ApiErrorCode } from "@/lib/schemas";

export const runtime = "nodejs";
// Photon, then two Overpass mirrors at 5 s each, plus routing
export const maxDuration = 30;

// CITYWALK_OFFLINE=1: fixtures only, no routing (e2e, demos without network)
const offline = process.env.CITYWALK_OFFLINE === "1";
const fixtures = createFixtureProvider();
const deps = offline
  ? { pois: fixtures, routing: null, events: createEventProvider() }
  : {
      pois: createLivePoiProvider(),
      fallbackPois: fixtures,
      routing: createOsrmProvider(),
      events: createEventProvider(),
    };

function fail(status: number, code: ApiErrorCode, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "BAD_REQUEST", "Request body is not valid JSON.");
  }
  const parsed = routeRequestSchema.safeParse(body);
  if (!parsed.success) return fail(400, "BAD_REQUEST", "Invalid request parameters.");

  try {
    return NextResponse.json(await generateRoute(parsed.data, deps));
  } catch (err) {
    if (err instanceof RouteError) {
      return fail(err.code === "NO_RESULTS" ? 422 : 502, err.code, err.message);
    }
    console.error("route generation failed", err);
    return fail(500, "INTERNAL", "Route generation failed.");
  }
}
