import { haversine, pathLength } from "@/lib/geo";
import { DISTANCE_TOLERANCE, STOP_COUNT, STREET_FACTOR, targetMeters } from "@/lib/themes";
import type { Category, Duration, LatLng, Poi, RoutePlan, WarningCode } from "@/types";
import { scorePoi } from "./score";

// Date mode answers "where should we go?" with a small story instead of a
// shortest path: start with something sweet, wander, catch a view, and end
// somewhere you can sit down together. The order of the stops is the point,
// so unlike the other themes the result is NOT re-ordered by 2-opt.

const OPENER: Category[] = ["ice_cream", "cafe"];
const STROLL: Category[] = ["park", "viewpoint", "art_gallery", "bookshop", "attraction"];
const FINALE: Category[] = ["restaurant", "bar"];
/** The stop before the finale should be the scenic one if there is a view within reach. */
const VIEW_BONUS = 1.5;

type Slot = { allowed: Category[]; preferView?: boolean };

/** One slot per stop, in walking order. */
export function dateSlots(count: number): Slot[] {
  if (count <= 2) return [{ allowed: OPENER }, { allowed: FINALE }];
  const middle = Array.from({ length: count - 2 }, (_, i): Slot => ({
    allowed: STROLL,
    preferView: i === count - 3,
  }));
  return [{ allowed: OPENER }, ...middle, { allowed: FINALE }];
}

const MIN_SPACING_M = 60;
const MAX_PER_CATEGORY = 2;

export function planDateRoute(
  candidates: Poi[],
  input: { start: LatLng; durationMinutes: Duration; seed?: number },
): RoutePlan {
  const { start, durationMinutes, seed = 0 } = input;
  const target = targetMeters(durationMinutes);
  const count = STOP_COUNT[durationMinutes];
  const idealLegMeters = target / STREET_FACTOR / count;
  const warnings: WarningCode[] = [];

  const stops: Poi[] = [];
  const counts = new Map<Category, number>();
  for (const slot of dateSlots(count)) {
    const last = stops[stops.length - 1];
    const usable = (allowed: Category[], spacing: number) =>
      candidates.filter(
        (c) =>
          allowed.includes(c.category) &&
          !stops.includes(c) &&
          (counts.get(c.category) ?? 0) < MAX_PER_CATEGORY &&
          ![start, ...stops].some((p) => haversine(p, c) < spacing),
      );
    // Save the last viewpoint for the slot that wants it.
    const viewsLeft = candidates.filter((c) => c.category === "viewpoint" && !stops.includes(c)).length;
    const allowed =
      slot.allowed === STROLL && !slot.preferView && viewsLeft <= 1
        ? STROLL.filter((c) => c !== "viewpoint")
        : slot.allowed;
    // Prefer a well-spaced match; then any match (a restaurant next door to
    // the gelato place still beats no dinner); then a stroll stop.
    let pool = usable(allowed, MIN_SPACING_M);
    if (pool.length === 0) pool = usable(allowed, 0);
    if (pool.length === 0 && slot.allowed !== STROLL) pool = usable(STROLL, MIN_SPACING_M);
    let best: Poi | null = null;
    let bestScore = -Infinity;
    for (const cand of pool) {
      const bonus = slot.preferView && cand.category === "viewpoint" ? VIEW_BONUS : 0;
      const score = bonus + scorePoi(cand, {
        theme: "date",
        from: last ?? start,
        lastCategory: last?.category ?? null,
        pickedCategories: new Set(counts.keys()),
        idealLegMeters,
        seed,
      });
      if (score > bestScore) {
        best = cand;
        bestScore = score;
      }
    }
    if (!best) continue;
    stops.push(best);
    counts.set(best.category, (counts.get(best.category) ?? 0) + 1);
  }

  // Too long: remove middle stops, never the opener or the finale.
  const estimate = (list: Poi[]) => pathLength([start, ...list]) * STREET_FACTOR;
  while (stops.length > 3 && estimate(stops) > target * (1 + DISTANCE_TOLERANCE)) {
    let dropIndex = 1;
    let shortest = Infinity;
    for (let i = 1; i < stops.length - 1; i++) {
      const length = estimate(stops.filter((_, k) => k !== i));
      if (length < shortest) {
        shortest = length;
        dropIndex = i;
      }
    }
    stops.splice(dropIndex, 1);
  }

  const estimatedMeters = estimate(stops);
  if (stops.length >= 2 && stops.length < count) warnings.push("FEW_PLACES");
  if (stops.length >= 2 && estimatedMeters < target * (1 - DISTANCE_TOLERANCE)) {
    warnings.push("SHORTER_THAN_TARGET");
  }
  return { start, stops, targetMeters: target, estimatedMeters, warnings };
}
