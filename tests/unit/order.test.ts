import { describe, expect, it } from "vitest";
import { nearestNeighbor, orderStops, pathCost, twoOpt } from "@/lib/route/order";
import { ORIGIN, poi } from "./helpers";

describe("ordering", () => {
  it("nearest neighbour walks to the closest stop first", () => {
    const far = poi(900, 0, "park");
    const near = poi(100, 0, "cafe");
    const mid = poi(500, 0, "museum");
    expect(nearestNeighbor(ORIGIN, [far, near, mid])).toEqual([near, mid, far]);
  });

  it("2-opt untangles a crossing path", () => {
    // crossing diagonals
    const a = poi(0, 500, "cafe");
    const b = poi(500, 0, "park");
    const c = poi(500, 500, "museum");
    const crossed = [c, b, a];
    const fixed = twoOpt(ORIGIN, crossed);
    expect(pathCost(ORIGIN, fixed)).toBeLessThan(pathCost(ORIGIN, crossed));
    expect(fixed.map((p) => p.id).sort()).toEqual(crossed.map((p) => p.id).sort());
  });

  it("2-opt never makes a nearest-neighbour path worse", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 2000 - 1000;
    for (let round = 0; round < 20; round++) {
      const stops = Array.from({ length: 7 }, () => poi(rand(), rand(), "attraction"));
      const nn = nearestNeighbor(ORIGIN, stops);
      expect(pathCost(ORIGIN, twoOpt(ORIGIN, nn))).toBeLessThanOrEqual(pathCost(ORIGIN, nn) + 1e-6);
    }
  });

  it("separates same-category neighbours when the detour is small", () => {
    // by distance alone this would be cafe, cafe, park
    const cafe1 = poi(100, 0, "cafe");
    const cafe2 = poi(200, 0, "cafe");
    const park = poi(260, 0, "park");
    const order = orderStops(ORIGIN, [cafe1, cafe2, park]);
    expect(order.map((p) => p.category)).toEqual(["cafe", "park", "cafe"]);
  });
});
