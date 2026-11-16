import { describe, expect, it } from "vitest";
import { haversine, pathLength } from "@/lib/geo";
import { targetMeters, walkMinutes } from "@/lib/themes";
import { at, ORIGIN } from "./helpers";

describe("geo", () => {
  it("measures a known distance (Colosseum → Trevi ≈ 1.45 km)", () => {
    const d = haversine({ lat: 41.8902, lng: 12.4922 }, { lat: 41.9009, lng: 12.4833 });
    expect(d).toBeGreaterThan(1350);
    expect(d).toBeLessThan(1500);
  });

  it("sums a path", () => {
    expect(pathLength([ORIGIN, at(300, 0), at(300, 400)])).toBeCloseTo(700, -1);
  });

  it("uses 4.5 km/h", () => {
    expect(targetMeters(60)).toBe(4500);
    expect(walkMinutes(4500)).toBe(60);
  });
});
