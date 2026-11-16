import { afterEach, describe, expect, it, vi } from "vitest";
import { clearHttpCache, fetchJson } from "@/lib/http";
import { createFixtureProvider, fixtureCityFor } from "@/lib/providers/fixtures";
import { createOsrmProvider, parseOsrm } from "@/lib/providers/osrm";
import { buildIdQuery, buildSearchQuery, createOverpassProvider, parseOverpass } from "@/lib/providers/overpass";
import { CITIES } from "@/lib/cities";
import { planRoute } from "@/lib/route/plan";
import { DURATIONS, THEMES, themeCategories } from "@/lib/themes";
import overpassSample from "./samples/overpass.json";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
  clearHttpCache();
});

describe("Overpass", () => {
  // The first two elements are a real response; the last three were added by
  // hand to cover a missing name, missing coordinates and a malformed element.
  it("parses a real response and skips unusable elements", () => {
    expect(parseOverpass(overpassSample)).toEqual([
      { id: "node/32631124", name: "Giolitti", category: "cafe", lat: 41.9010573, lng: 12.4772481, tagCount: 18 },
      { id: "way/4247138", name: "Piazza Navona", category: "attraction", lat: 41.8989256, lng: 12.4730991, tagCount: 18 },
    ]);
  });

  it("rejects a response without elements", () => {
    expect(() => parseOverpass({ remark: "runtime error" })).toThrow();
  });

  it("builds queries", () => {
    const q = buildSearchQuery({ center: { lat: 41.9, lng: 12.48 }, radiusMeters: 2025, categories: ["cafe", "park"] });
    expect(q).toContain('nwr["amenity"="cafe"]["name"](around:2025,41.9,12.48);');
    expect(q).toContain("out center tags");
    expect(buildIdQuery(["node/1", "way/2", "node/3"])).toContain("node(id:1,3);way(id:2);");
  });

  it("tries the next mirror when the first fails, and sends a User-Agent", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({}, 504))
      .mockResolvedValueOnce(json(overpassSample));
    vi.stubGlobal("fetch", fetchMock);
    const provider = createOverpassProvider(["https://a.example/api", "https://b.example/api"]);
    const pois = await provider.search({ center: { lat: 41.9, lng: 12.48 }, radiusMeters: 1000, categories: ["cafe"] });
    expect(pois).toHaveLength(2);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["https://a.example/api", "https://b.example/api"]);
    expect(fetchMock.mock.calls[0][1].headers["User-Agent"]).toMatch(/citywalk/);
  });

  it("gives up after one attempt per mirror", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({}, 429));
    vi.stubGlobal("fetch", fetchMock);
    const provider = createOverpassProvider(["https://a.example/api", "https://b.example/api"]);
    await expect(
      provider.search({ center: { lat: 41.9, lng: 12.48 }, radiusMeters: 1000, categories: ["cafe"] }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("OSRM", () => {
  const ok = {
    code: "Ok",
    routes: [{ distance: 2062.5, duration: 1652.5, geometry: { type: "LineString", coordinates: [[12.492187, 41.889945], [12.496426, 41.902813]] } }],
  };

  it("parses a route and rejects errors", () => {
    expect(parseOsrm(ok).distanceMeters).toBe(2062.5);
    expect(() => parseOsrm({ code: "NoRoute", routes: [] })).toThrow();
  });

  it("dedupes waypoints, retries once on 5xx and caches the result", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({}, 503)).mockImplementation(async () => json(ok));
    vi.stubGlobal("fetch", fetchMock);
    const osrm = createOsrmProvider("https://router.example/routed-foot", "foot");
    const a = { lat: 41.8902, lng: 12.4922 };
    const b = { lat: 41.9028, lng: 12.4964 };
    const path = await osrm.walk([a, a, b]);
    expect(path.distanceMeters).toBe(2062.5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://router.example/routed-foot/route/v1/foot/12.4922,41.8902;12.4964,41.9028?overview=full&geometries=geojson",
    );
    await osrm.walk([a, b]);
    expect(fetchMock).toHaveBeenCalledTimes(2); // served from cache
  });
});

describe("fetchJson", () => {
  it("turns a hung request into a timeout error", async () => {
    vi.stubGlobal(
      "fetch",
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason))),
    );
    await expect(fetchJson("https://slow.example/x", { timeoutMs: 20 })).rejects.toMatchObject({ kind: "timeout" });
  });

  it("does not retry client errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({}, 400));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchJson("https://x.example/y", { retries: 2 })).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("fixtures", () => {
  const fixtures = createFixtureProvider();

  it("maps a point to the nearest preset city, or none", () => {
    expect(fixtureCityFor({ lat: 41.9, lng: 12.48 })).toBe("rome");
    expect(fixtureCityFor({ lat: 48.8566, lng: 2.3522 })).toBeNull();
  });

  // Acceptance criterion: every preset city yields ≥ 4 stops for a 60-minute
  // coffee walk even with all external services down.
  it.each(CITIES)("$id: 60-minute coffee walk has at least 4 stops offline", async (city) => {
    const pois = await fixtures.search({ center: city.center, radiusMeters: 2025, categories: themeCategories("coffee") });
    const plan = planRoute(pois, { start: city.center, durationMinutes: 60, theme: "coffee" });
    expect(plan.stops.length).toBeGreaterThanOrEqual(4);
  });

  it("every theme and duration yields a walkable plan in every preset city", async () => {
    for (const city of CITIES) {
      for (const theme of THEMES) {
        for (const durationMinutes of DURATIONS) {
          const pois = await fixtures.search({ center: city.center, radiusMeters: 5000, categories: themeCategories(theme) });
          const plan = planRoute(pois, { start: city.center, durationMinutes, theme });
          expect(plan.stops.length, `${city.id}/${theme}/${durationMinutes}`).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it("finds pinned stops by id", async () => {
    expect((await fixtures.byIds(["node/32631124", "node/0"])).map((p) => p.name)).toEqual(["Giolitti"]);
  });
});
