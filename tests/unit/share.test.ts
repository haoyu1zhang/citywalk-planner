import { describe, expect, it } from "vitest";
import { toGeoJSON } from "@/lib/geojson";
import { decodeRouteParams, decodeStopIds, encodeRouteParams, encodeStopIds } from "@/lib/share";
import type { RouteRequest, RouteResponse } from "@/types";

describe("share URL", () => {
  const req: RouteRequest = {
    city: "rome",
    start: { lat: 41.8986, lng: 12.4769 },
    durationMinutes: 60,
    theme: "coffee",
    seed: 2,
    stopIds: ["node/123", "way/456", "relation/7"],
  };

  it("round-trips a request", () => {
    expect(decodeRouteParams(new URLSearchParams(encodeRouteParams(req)))).toEqual(req);
  });

  it("keeps commas readable", () => {
    expect(encodeRouteParams(req)).toContain("stops=n123,w456,r7");
  });

  it("omits optional parts", () => {
    const qs = encodeRouteParams({ ...req, seed: undefined, stopIds: undefined });
    expect(qs).toBe("city=rome&lat=41.8986&lng=12.4769&d=60&theme=coffee");
  });

  it("carries event stops alongside OSM ones", () => {
    const ids = ["node/1", "event/Z698xZb_Z17a-9", "way/2"];
    expect(encodeStopIds(ids)).toBe("n1,eZ698xZb_Z17a-9,w2");
    expect(decodeStopIds("n1,eZ698xZb_Z17a-9,w2")).toEqual(ids);
    const qs = encodeRouteParams({ ...req, theme: "date", stopIds: ids });
    expect(decodeRouteParams(new URLSearchParams(qs))?.stopIds).toEqual(ids);
  });

  it("encodes stop ids compactly", () => {
    expect(encodeStopIds(req.stopIds!)).toBe("n123,w456,r7");
    expect(decodeStopIds("n123,w456,r7")).toEqual(req.stopIds);
  });

  it.each([
    "",
    "city=rome&lat=41.9&lng=12.5&d=45&theme=coffee", // unsupported duration
    "city=rome&lat=41.9&lng=12.5&d=60&theme=nightlife",
    "city=rome&lat=abc&lng=12.5&d=60&theme=coffee",
    "city=rome&lat=41.9&lng=12.5&d=60&theme=coffee&stops=x12",
  ])("rejects %j", (qs) => {
    expect(decodeRouteParams(new URLSearchParams(qs))).toBeNull();
  });
});

describe("toGeoJSON", () => {
  it("exports the line and one point per stop", () => {
    const route: RouteResponse = {
      routeId: "abc",
      summary: { distanceMeters: 1000, durationMinutes: 13, stopCount: 1 },
      stops: [
        { id: "node/1", name: "Bar", category: "cafe", lat: 41.9, lng: 12.5, suggestedStayMinutes: 20, osmUrl: "https://www.openstreetmap.org/node/1" },
      ],
      geometry: { type: "LineString", coordinates: [[12.49, 41.89], [12.5, 41.9]] },
      warnings: [],
    };
    const fc = toGeoJSON(route);
    expect(fc.features.map((f) => f.geometry.type)).toEqual(["LineString", "Point"]);
    expect(fc.features[1].geometry).toEqual({ type: "Point", coordinates: [12.5, 41.9] });
    expect(fc.features[1].properties).toMatchObject({ order: 1, name: "Bar" });
  });
});
