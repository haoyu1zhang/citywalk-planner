import { afterEach, describe, expect, it, vi } from "vitest";
import { haversine } from "@/lib/geo";
import { clearHttpCache } from "@/lib/http";
import { chainPoiProviders } from "@/lib/providers/live";
import { geocode, lookupPlaces, reverseCity } from "@/lib/providers/nominatim";
import { createPhotonProvider, parsePhoton, reverseUrl, ringPoints } from "@/lib/providers/photon";
import type { PoiProvider } from "@/lib/providers/types";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
  clearHttpCache();
});

// first two features are from a real response (Paris, reverse with osm_tag=amenity:cafe)
const sample = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { osm_type: "N", osm_id: 8932455801, osm_key: "amenity", osm_value: "cafe", type: "house", name: "Marlette", street: "Rue de Rivoli", city: "Paris", country: "France", postcode: "75004", countrycode: "FR" },
      geometry: { type: "Point", coordinates: [2.3526636, 48.8574019] },
    },
    {
      type: "Feature",
      properties: { osm_type: "W", osm_id: 24267141, osm_key: "leisure", osm_value: "park", name: "Square de la Tour Saint-Jacques", city: "Paris" },
      geometry: { type: "Point", coordinates: [2.3488, 48.8580] },
    },
    { type: "Feature", properties: { osm_type: "N", osm_id: 1, osm_key: "amenity", osm_value: "cafe" }, geometry: { type: "Point", coordinates: [2.35, 48.85] } },
    { type: "Feature", properties: { osm_type: "W", osm_id: 2, osm_key: "historic", osm_value: "building", name: "Old house" }, geometry: { type: "Point", coordinates: [2.35, 48.85] } },
    { type: "Feature", properties: { osm_type: "R", osm_id: 3, osm_key: "historic", osm_value: "memorial", name: "Memorial" }, geometry: { type: "Point", coordinates: [2.351, 48.851] } },
    { type: "Feature", properties: { osm_type: "N", osm_id: 4, osm_key: "shop", osm_value: "bakery", name: "Boulangerie" }, geometry: { type: "Point", coordinates: [2.35, 48.85] } },
    { broken: true },
  ],
};

describe("Photon", () => {
  it("maps features to places and drops unnamed or off-category ones", () => {
    const pois = parsePhoton(sample);
    expect(pois.map((p) => [p.id, p.name, p.category])).toEqual([
      ["node/8932455801", "Marlette", "cafe"],
      ["way/24267141", "Square de la Tour Saint-Jacques", "park"],
      ["relation/3", "Memorial", "historic"],
    ]);
    expect(pois[0]).toMatchObject({ lat: 48.8574019, lng: 2.3526636 });
    expect(() => parsePhoton({ message: "error" })).toThrow();
  });

  it("builds reverse URLs with one osm_tag per tag", () => {
    const url = new URL(reverseUrl({ lat: 48.85661, lng: 2.35222 }, 2.025, ["leisure:park", "leisure:garden"]));
    expect(url.pathname).toBe("/reverse");
    expect(url.searchParams.get("radius")).toBe("2.02");
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.getAll("osm_tag")).toEqual(["leisure:park", "leisure:garden"]);
  });

  it("places ring points at the right distance", () => {
    const center = { lat: 48.8566, lng: 2.3522 };
    for (const p of ringPoints(center, 1000)) expect(haversine(center, p)).toBeCloseTo(1000, -1);
  });

  it("asks per category plus four ring requests, and merges the results", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json(sample));
    vi.stubGlobal("fetch", fetchMock);
    const pois = await createPhotonProvider().search({
      center: { lat: 48.8566, lng: 2.3522 },
      radiusMeters: 2025,
      categories: ["cafe", "park"],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2 + 4);
    expect(pois.map((p) => p.id).sort()).toEqual(["node/8932455801", "way/24267141"]);
  });

  it("keeps partial results when some requests fail, fails when all do", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => (n++ === 0 ? json(sample) : json({}, 500))));
    const query = { center: { lat: 48.8566, lng: 2.3522 }, radiusMeters: 2025, categories: ["cafe" as const] };
    expect(await createPhotonProvider().search(query)).toHaveLength(1);

    clearHttpCache();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({}, 503)));
    await expect(createPhotonProvider().search(query)).rejects.toThrow();
  });
});

describe("Nominatim", () => {
  it("looks places up by OSM id, keeping the order and the original name", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json([
        { osm_type: "relation", osm_id: 1834818, category: "historic", type: "archaeological_site", name: "Colosseum", namedetails: { name: "Colosseo", "name:en": "Colosseum" }, lat: "41.8902572", lon: "12.4922" },
        { osm_type: "node", osm_id: 8932455801, category: "amenity", type: "cafe", name: "Marlette", namedetails: { name: "Marlette" }, lat: "48.8574019", lon: "2.3526636" },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const pois = await lookupPlaces(["node/8932455801", "way/1", "relation/1834818"]);
    expect(pois.map((p) => [p.id, p.name, p.category])).toEqual([
      ["node/8932455801", "Marlette", "cafe"],
      ["relation/1834818", "Colosseo", "historic"],
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("osm_ids=N8932455801,R1834818,W1");
  });

  it("searches cities with the short name and the full label", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json([{ name: "巴塞罗那", display_name: "巴塞罗那, 巴塞罗那县, 加泰罗尼亚, 西班牙", lat: "41.3825802", lon: "2.177073" }]),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await geocode("Barcelona", { kind: "city", lang: "zh" })).toEqual([
      { name: "巴塞罗那", label: "巴塞罗那, 巴塞罗那县, 加泰罗尼亚, 西班牙", lat: 41.3825802, lng: 2.177073 },
    ]);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("featureType")).toBe("settlement");
    expect(url.searchParams.get("accept-language")).toBe("zh");
  });

  it("finds the city name for a point", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json({ name: "City of Westminster", lat: "51.5", lon: "-0.13", address: { city: "City of Westminster", country: "United Kingdom" } }),
      ),
    );
    expect(await reverseCity(51.5072, -0.1276)).toEqual({
      name: "City of Westminster",
      label: "City of Westminster, United Kingdom",
      lat: 51.5072,
      lng: -0.1276,
    });
  });
});

describe("chainPoiProviders", () => {
  const ok = (name: string): PoiProvider => ({
    name,
    search: async () => [{ id: `node/${name.length}`, name, category: "cafe", lat: 0, lng: 0, tagCount: 1 }],
    byIds: async () => [],
  });
  const down: PoiProvider = { name: "down", search: () => Promise.reject(new Error("x")), byIds: () => Promise.reject(new Error("x")) };

  it("uses the first provider that answers", async () => {
    const q = { center: { lat: 0, lng: 0 }, radiusMeters: 100, categories: ["cafe" as const] };
    expect((await chainPoiProviders([down, ok("b"), ok("ccc")]).search(q))[0].name).toBe("b");
    await expect(chainPoiProviders([down, down]).search(q)).rejects.toThrow();
  });
});
