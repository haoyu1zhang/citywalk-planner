import { NextResponse } from "next/server";
import { geocode } from "@/lib/providers/nominatim";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 120) {
    return NextResponse.json({ results: [] }, { status: 400 });
  }
  if (process.env.CITYWALK_OFFLINE === "1") return NextResponse.json({ results: [] });
  try {
    const results = await geocode(q);
    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
    );
  } catch {
    return NextResponse.json(
      { results: [], error: { code: "POI_UNAVAILABLE", message: "地标搜索暂时不可用,请直接在地图上点选起点。" } },
      { status: 502 },
    );
  }
}
