import { haversine, pathLength } from "@/lib/geo";
import {
  DISTANCE_TOLERANCE,
  STOP_COUNT,
  STREET_FACTOR,
  THEME_CONFIG,
  targetMeters,
  themeCategories,
} from "@/lib/themes";
import type { Category, Duration, LatLng, Poi, RoutePlan, Theme, WarningCode } from "@/types";
import { planDateRoute } from "./date";
import { filterCandidates } from "./candidates";
import { orderStops } from "./order";
import { scorePoi } from "./score";

/** Two stops closer than this read as one place on the map. */
const MIN_SPACING_M = 60;
export const MIN_STOPS = 2;

export function searchRadius(durationMinutes: number): number {
  return Math.max(600, targetMeters(durationMinutes) * 0.45);
}

export function categoryCap(theme: Theme, category: Category): number {
  const cfg = THEME_CONFIG[theme];
  if (cfg.primary.includes(category)) return cfg.primary.length === 1 ? 3 : 2;
  return 1;
}

export function estimateMeters(start: LatLng, stops: LatLng[]): number {
  return pathLength([start, ...stops]) * STREET_FACTOR;
}

interface SelectOptions {
  theme: Theme;
  start: LatLng;
  count: number;
  idealLegMeters: number;
  seed: number;
}

// greedy pick, respecting category caps and minimum spacing
export function selectStops(candidates: Poi[], opts: SelectOptions, already: Poi[] = []): Poi[] {
  const picked = [...already];
  const counts = new Map<Category, number>();
  for (const p of picked) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  const pool = candidates.filter((c) => !picked.some((p) => p.id === c.id));

  while (picked.length < opts.count) {
    const last = picked[picked.length - 1];
    let best: Poi | null = null;
    let bestScore = -Infinity;
    for (const cand of pool) {
      if ((counts.get(cand.category) ?? 0) >= categoryCap(opts.theme, cand.category)) continue;
      if ([opts.start, ...picked].some((p) => haversine(p, cand) < MIN_SPACING_M)) continue;
      const score = scorePoi(cand, {
        theme: opts.theme,
        from: last ?? opts.start,
        lastCategory: last?.category ?? null,
        pickedCategories: new Set(counts.keys()),
        idealLegMeters: opts.idealLegMeters,
        seed: opts.seed,
      });
      if (score > bestScore) {
        best = cand;
        bestScore = score;
      }
    }
    if (!best) break;
    picked.push(best);
    counts.set(best.category, (counts.get(best.category) ?? 0) + 1);
    pool.splice(pool.indexOf(best), 1);
  }
  return picked;
}

export function dropCostliestStop<T extends LatLng>(start: LatLng, stops: T[]): T[] {
  let bestIndex = 0;
  let bestLength = Infinity;
  for (let i = 0; i < stops.length; i++) {
    const length = pathLength([start, ...stops.filter((_, k) => k !== i)]);
    if (length < bestLength) {
      bestLength = length;
      bestIndex = i;
    }
  }
  return stops.filter((_, k) => k !== bestIndex);
}

export interface PlanInput {
  start: LatLng;
  durationMinutes: Duration;
  theme: Theme;
  seed?: number;
}

// No I/O here: filter, select, order, fit to the target distance. Works on
// straight lines * STREET_FACTOR; the routed distance is checked in service.ts.
export function planRoute(pois: Poi[], input: PlanInput): RoutePlan {
  const { start, durationMinutes, theme, seed = 0 } = input;
  const target = targetMeters(durationMinutes);
  const count = STOP_COUNT[durationMinutes];
  const warnings: WarningCode[] = [];

  const candidates = filterCandidates(pois, start, searchRadius(durationMinutes), themeCategories(theme));
  if (theme === "date") return planDateRoute(candidates, { start, durationMinutes, seed });

  const opts: SelectOptions = {
    theme,
    start,
    count,
    idealLegMeters: target / STREET_FACTOR / count,
    seed,
  };

  let stops = orderStops(start, selectStops(candidates, opts));

  // too long: drop stops, but not below the floor
  const floor = Math.min(count, durationMinutes >= 60 ? 4 : MIN_STOPS);
  while (stops.length > floor && estimateMeters(start, stops) > target * (1 + DISTANCE_TOLERANCE)) {
    stops = orderStops(start, dropCostliestStop(start, stops));
  }

  // too short: try up to two more stops
  for (let extra = 1; extra <= 2; extra++) {
    if (estimateMeters(start, stops) >= target * (1 - DISTANCE_TOLERANCE)) break;
    const grown = selectStops(candidates, { ...opts, count: stops.length + 1 }, stops);
    if (grown.length === stops.length) break;
    const reordered = orderStops(start, grown);
    if (estimateMeters(start, reordered) > target * (1 + DISTANCE_TOLERANCE)) break;
    stops = reordered;
  }

  const estimatedMeters = estimateMeters(start, stops);
  if (stops.length < count && stops.length >= MIN_STOPS && candidates.length < count) {
    warnings.push("FEW_PLACES");
  }
  if (stops.length >= MIN_STOPS && estimatedMeters < target * (1 - DISTANCE_TOLERANCE)) {
    warnings.push("SHORTER_THAN_TARGET");
  }
  return { start, stops, targetMeters: target, estimatedMeters, warnings };
}
