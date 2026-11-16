import { describe, expect, it, vi } from "vitest";
import type { PoiProvider, RoutingProvider } from "@/lib/providers/types";
import { generateRoute, RouteError } from "@/lib/route/service";
import { routeResponseSchema } from "@/lib/schemas";
import { targetMeters } from "@/lib/themes";
import type { LatLng, Poi, RouteRequest } from "@/types";
import { ORIGIN, ring } from "./helpers";

const POIS = [
  ...ring(10, 700, ["cafe", "park", "bookshop", "attraction", "historic"]),
  ...ring(10, 1400, ["cafe", "historic", "cafe", "park", "attraction"]),
];
const REQ: RouteRequest = { city: "rome", start: ORIGIN, durationMinutes: 60, theme: "coffee" };

const provider = (name: string, pois: Poi[]): PoiProvider => ({
  name,
  search: async () => pois,
  byIds: async (ids) => ids.flatMap((id) => pois.find((p) => p.id === id) ?? []),
});
const broken: PoiProvider = {
  name: "overpass",
  search: async () => Promise.reject(new Error("timeout")),
  byIds: async () => Promise.reject(new Error("timeout")),
};
/** Routing stub whose distance depends only on the number of waypoints. */
const routing = (distanceFor: (points: number) => number): RoutingProvider => ({
  name: "stub",
  walk: vi.fn(async (points: LatLng[]) => ({
    geometry: { type: "LineString" as const, coordinates: points.map((p) => [p.lng, p.lat] as [number, number]) },
    distanceMeters: distanceFor(points.length),
  })),
});

describe("generateRoute", () => {
  it("returns a response matching the public schema", async () => {
    const res = await generateRoute(REQ, { pois: provider("overpass", POIS), routing: routing(() => 4400) });
    expect(() => routeResponseSchema.parse(res)).not.toThrow();
    expect(res.summary).toEqual({ distanceMeters: 4400, durationMinutes: 59, stopCount: res.stops.length });
    expect(res.stops.length).toBeGreaterThanOrEqual(4);
    expect(res.stops[0].osmUrl).toMatch(/^https:\/\/www\.openstreetmap\.org\/node\/\d+$/);
    expect(res.warnings).toEqual([]);
  });

  it("says so when running offline", async () => {
    const res = await generateRoute(REQ, { pois: provider("fixture", POIS), routing: null });
    expect(res.warnings.join()).toContain("离线演示模式");
  });

  it("falls back to fixtures with a warning when Overpass fails", async () => {
    const res = await generateRoute(REQ, {
      pois: broken,
      fallbackPois: provider("fixture", POIS),
      routing: routing(() => 4000),
    });
    expect(res.stops.length).toBeGreaterThanOrEqual(4);
    expect(res.warnings.join()).toContain("示例数据");
  });

  it("throws POI_UNAVAILABLE when Overpass fails and no fixture covers the area", async () => {
    await expect(
      generateRoute(REQ, { pois: broken, fallbackPois: provider("fixture", []), routing: null }),
    ).rejects.toMatchObject({ code: "POI_UNAVAILABLE" });
  });

  it("throws NO_RESULTS when nothing is nearby", async () => {
    const err = await generateRoute(REQ, { pois: provider("overpass", []), routing: null }).catch((e) => e);
    expect(err).toBeInstanceOf(RouteError);
    expect(err.code).toBe("NO_RESULTS");
  });

  it("draws straight lines with a warning when routing fails", async () => {
    const failing: RoutingProvider = { name: "osrm", walk: async () => Promise.reject(new Error("503")) };
    const res = await generateRoute(REQ, { pois: provider("overpass", POIS), routing: failing });
    expect(res.geometry.coordinates).toHaveLength(res.stops.length + 1);
    expect(res.warnings.join()).toContain("直线");
  });

  it("drops stops when the routed distance breaks the 1.5× limit", async () => {
    // Each waypoint "costs" 1.3 km of street: 6 points → 7.8 km > 6.75 km limit.
    const stub = routing((n) => n * 1300);
    const res = await generateRoute(REQ, { pois: provider("overpass", POIS), routing: stub });
    expect(res.summary.distanceMeters).toBeLessThanOrEqual(targetMeters(60) * 1.5);
    expect(stub.walk).toHaveBeenCalledTimes(2);
    expect(res.warnings.join()).toContain("绕路");
  });

  it("reproduces pinned stops in the given order", async () => {
    const pois = provider("overpass", POIS);
    const first = await generateRoute(REQ, { pois, routing: null });
    const ids = first.stops.map((s) => s.id).reverse();
    const again = await generateRoute({ ...REQ, stopIds: ids }, { pois, routing: null });
    expect(again.stops.map((s) => s.id)).toEqual(ids);
  });

  it("re-plans with a warning when pinned stops no longer exist", async () => {
    const res = await generateRoute(
      { ...REQ, stopIds: ["node/999999991", "node/999999992"] },
      { pois: provider("overpass", POIS), routing: null },
    );
    expect(res.stops.length).toBeGreaterThanOrEqual(4);
    expect(res.warnings.join()).toContain("重新规划");
  });

  it("gives the same routeId for the same route", async () => {
    const deps = { pois: provider("overpass", POIS), routing: null };
    expect((await generateRoute(REQ, deps)).routeId).toBe((await generateRoute(REQ, deps)).routeId);
  });
});
