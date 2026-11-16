import { NextResponse } from "next/server";
import { createFixtureProvider } from "@/lib/providers/fixtures";
import { createOsrmProvider } from "@/lib/providers/osrm";
import { createOverpassProvider } from "@/lib/providers/overpass";
import { generateRoute, RouteError } from "@/lib/route/service";
import { routeRequestSchema, type ApiErrorCode } from "@/lib/schemas";

export const runtime = "nodejs";
// Worst case: two Overpass mirrors (8 s each) + two routing attempts.
export const maxDuration = 30;

// CITYWALK_OFFLINE=1 serves the bundled fixtures and skips routing entirely:
// used by the E2E test and for demos without network access.
const offline = process.env.CITYWALK_OFFLINE === "1";
const fixtures = createFixtureProvider();
const deps = offline
  ? { pois: fixtures, routing: null }
  : { pois: createOverpassProvider(), fallbackPois: fixtures, routing: createOsrmProvider() };

function fail(status: number, code: ApiErrorCode, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "BAD_REQUEST", "请求体不是合法的 JSON。");
  }
  const parsed = routeRequestSchema.safeParse(body);
  if (!parsed.success) return fail(400, "BAD_REQUEST", "请求参数不合法。");

  try {
    return NextResponse.json(await generateRoute(parsed.data, deps));
  } catch (err) {
    if (err instanceof RouteError) {
      return fail(err.code === "NO_RESULTS" ? 422 : 502, err.code, err.message);
    }
    console.error("route generation failed", err);
    return fail(500, "INTERNAL", "生成路线时出了点问题,请重试。");
  }
}
