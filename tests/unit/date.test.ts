import { describe, expect, it } from "vitest";
import { CITIES } from "@/lib/cities";
import { createFixtureProvider } from "@/lib/providers/fixtures";
import { dateSlots, planDateRoute } from "@/lib/route/date";
import { planRoute, searchRadius } from "@/lib/route/plan";
import { DURATIONS, targetMeters, themeCategories } from "@/lib/themes";
import { ORIGIN, poi } from "./helpers";

const OPENERS = ["ice_cream", "cafe"];
const FINALES = ["restaurant", "bar"];

describe("date mode", () => {
  it("lays out an arc: opener, strolls, finale", () => {
    const slots = dateSlots(5);
    expect(slots).toHaveLength(5);
    expect(slots[0].allowed).toEqual(OPENERS);
    expect(slots[4].allowed).toEqual(FINALES);
    expect(slots.filter((s) => s.preferView)).toEqual([slots[3]]);
  });

  it("keeps the arc order instead of the shortest path", () => {
    // shortest path would go dinner first, gelato last
    const gelato = poi(600, 0, "ice_cream");
    const park = poi(400, 300, "park");
    const view = poi(200, 500, "viewpoint");
    const dinner = poi(100, 100, "restaurant");
    const plan = planDateRoute([dinner, view, park, gelato], { start: ORIGIN, durationMinutes: 30 });
    expect(plan.stops[0]).toBe(gelato);
    expect(plan.stops[plan.stops.length - 1]).toBe(dinner);
  });

  it("puts a viewpoint right before the finale when one is in reach", () => {
    const candidates = [
      poi(300, 0, "cafe"),
      poi(600, 100, "park"),
      poi(900, 0, "bookshop"),
      poi(1200, 200, "park"),
      poi(1500, 100, "viewpoint"),
      poi(1800, 0, "restaurant"),
    ];
    const plan = planDateRoute(candidates, { start: ORIGIN, durationMinutes: 60 });
    const categories = plan.stops.map((s) => s.category);
    expect(categories[categories.length - 2]).toBe("viewpoint");
    expect(categories[categories.length - 1]).toBe("restaurant");
  });

  it("still plans something when there is nowhere to eat", () => {
    const plan = planDateRoute([poi(300, 0, "cafe"), poi(700, 0, "park"), poi(1100, 0, "viewpoint")], {
      start: ORIGIN,
      durationMinutes: 30,
    });
    expect(plan.stops.length).toBeGreaterThanOrEqual(2);
    expect(new Set(plan.stops.map((s) => s.id)).size).toBe(plan.stops.length);
  });

  it("is reachable through planRoute and changes with the seed", () => {
    const candidates = Array.from({ length: 30 }, (_, i) =>
      poi(200 + (i % 6) * 250, (i % 5) * 200, (["cafe", "ice_cream", "park", "viewpoint", "restaurant", "bar"] as const)[i % 6]),
    );
    const ids = (seed: number) =>
      planRoute(candidates, { start: ORIGIN, durationMinutes: 60, theme: "date", seed }).stops.map((s) => s.id).join();
    expect(ids(0)).toBe(ids(0));
    expect(new Set([ids(0), ids(1), ids(2), ids(3)]).size).toBeGreaterThan(1);
  });

  it.each(CITIES)("$id: opens sweet, ends at a table, and fits the time", async (city) => {
    const fixtures = createFixtureProvider();
    for (const durationMinutes of DURATIONS) {
      const pois = await fixtures.search({
        center: city.center,
        radiusMeters: searchRadius(durationMinutes),
        categories: themeCategories("date"),
      });
      const plan = planRoute(pois, { start: city.center, durationMinutes, theme: "date" });
      const label = `${city.id}/${durationMinutes}`;
      expect(plan.stops.length, label).toBeGreaterThanOrEqual(3);
      expect(OPENERS, label).toContain(plan.stops[0].category);
      expect(FINALES, label).toContain(plan.stops[plan.stops.length - 1].category);
      expect(plan.estimatedMeters, label).toBeLessThanOrEqual(targetMeters(durationMinutes) * 1.2);
    }
  });
});
