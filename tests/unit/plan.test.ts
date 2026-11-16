import { describe, expect, it } from "vitest";
import { filterCandidates } from "@/lib/route/candidates";
import { categoryCap, estimateMeters, planRoute, selectStops } from "@/lib/route/plan";
import { jitter, scorePoi } from "@/lib/route/score";
import { targetMeters } from "@/lib/themes";
import type { Poi } from "@/types";
import { ORIGIN, poi, ring } from "./helpers";

describe("filterCandidates", () => {
  it("drops far, unnamed, off-theme and duplicate places", () => {
    const keep = poi(100, 0, "cafe", { name: "Bar Roma" });
    const pois: Poi[] = [
      keep,
      { ...keep }, // same id
      poi(120, 0, "cafe", { name: "bar  roma", tagCount: 1 }), // same name, fewer tags
      poi(5000, 0, "cafe"), // too far
      poi(50, 50, "cafe", { name: "  " }), // no name
      poi(50, 80, "museum"), // not in the category list
    ];
    expect(filterCandidates(pois, ORIGIN, 1000, ["cafe"])).toEqual([keep]);
  });
});

describe("scorePoi", () => {
  const ctx = {
    theme: "coffee" as const,
    from: ORIGIN,
    lastCategory: null,
    pickedCategories: new Set<Poi["category"]>(),
    idealLegMeters: 500,
    seed: 0,
  };

  it("prefers the theme's headline category", () => {
    expect(scorePoi(poi(500, 0, "cafe"), ctx)).toBeGreaterThan(scorePoi(poi(500, 0, "park"), ctx));
  });

  it("penalises legs far from the ideal length, in both directions", () => {
    const ideal = scorePoi(poi(500, 0), ctx);
    expect(ideal).toBeGreaterThan(scorePoi(poi(30, 0), ctx));
    expect(ideal).toBeGreaterThan(scorePoi(poi(1500, 0), ctx));
  });

  it("penalises repeating the previous category", () => {
    const p = poi(500, 0, "cafe");
    expect(scorePoi(p, ctx)).toBeGreaterThan(scorePoi(p, { ...ctx, lastCategory: "cafe" }));
  });

  it("jitter is deterministic and off for seed 0", () => {
    expect(jitter("node/1", 0)).toBe(0);
    expect(jitter("node/1", 3)).toBe(jitter("node/1", 3));
    expect(jitter("node/1", 3)).not.toBe(jitter("node/1", 4));
  });
});

describe("selectStops", () => {
  it("respects per-category caps", () => {
    const cafes = ring(12, 500, ["cafe"]);
    const picked = selectStops(cafes, { theme: "coffee", start: ORIGIN, count: 6, idealLegMeters: 500, seed: 0 });
    expect(picked).toHaveLength(categoryCap("coffee", "cafe"));
  });

  it("skips candidates on top of an already picked stop", () => {
    const a = poi(400, 0, "cafe");
    const b = poi(410, 0, "park");
    const picked = selectStops([a, b], { theme: "coffee", start: ORIGIN, count: 2, idealLegMeters: 400, seed: 0 });
    expect(picked).toHaveLength(1);
  });
});

describe("planRoute", () => {
  const candidates = [
    ...ring(10, 700, ["cafe", "park", "bookshop", "attraction", "historic"]),
    ...ring(10, 1400, ["cafe", "historic", "cafe", "park", "attraction"]),
  ];

  it("plans a 60-minute coffee walk with at least 4 varied stops near the target length", () => {
    const plan = planRoute(candidates, { start: ORIGIN, durationMinutes: 60, theme: "coffee" });
    expect(plan.stops.length).toBeGreaterThanOrEqual(4);
    expect(plan.stops.filter((s) => s.category === "cafe").length).toBeLessThanOrEqual(3);
    expect(new Set(plan.stops.map((s) => s.id)).size).toBe(plan.stops.length);
    expect(plan.estimatedMeters).toBeLessThanOrEqual(targetMeters(60) * 1.2);
    expect(plan.estimatedMeters).toBe(estimateMeters(ORIGIN, plan.stops));
  });

  it("is deterministic, and a seed changes the pick", () => {
    const input = { start: ORIGIN, durationMinutes: 60 as const, theme: "coffee" as const };
    const ids = (seed?: number) => planRoute(candidates, { ...input, seed }).stops.map((s) => s.id);
    expect(ids()).toEqual(ids());
    expect(ids(1)).toEqual(ids(1));
    expect([ids(1), ids(2), ids(3)].some((v) => v.join() !== ids().join())).toBe(true);
  });

  it("warns instead of failing when there is little nearby", () => {
    const plan = planRoute([poi(200, 0, "cafe"), poi(0, 250, "park")], {
      start: ORIGIN,
      durationMinutes: 90,
      theme: "coffee",
    });
    expect(plan.stops).toHaveLength(2);
    expect(plan.warnings.length).toBeGreaterThan(0);
  });

  it("returns no stops when nothing matches", () => {
    expect(planRoute([], { start: ORIGIN, durationMinutes: 30, theme: "park" }).stops).toEqual([]);
  });
});
