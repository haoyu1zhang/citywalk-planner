import { haversine } from "@/lib/geo";
import type { LatLng, Poi } from "@/types";

/**
 * Two cafés in a row make a dull walk. Instead of fixing that after the fact,
 * same-category neighbours simply cost this many extra "metres", so both the
 * construction and the 2-opt pass trade distance against variety.
 */
export const SAME_CATEGORY_PENALTY_M = 150;

type Node = LatLng & { category?: string };

export function edgeCost(a: Node, b: Node): number {
  const same = a.category !== undefined && a.category === b.category;
  return haversine(a, b) + (same ? SAME_CATEGORY_PENALTY_M : 0);
}

export function pathCost(start: LatLng, stops: Poi[]): number {
  let cost = 0;
  let prev: Node = start;
  for (const stop of stops) {
    cost += edgeCost(prev, stop);
    prev = stop;
  }
  return cost;
}

/** Greedy construction: always walk to the cheapest unvisited stop. */
export function nearestNeighbor(start: LatLng, stops: Poi[]): Poi[] {
  const remaining = [...stops];
  const order: Poi[] = [];
  let current: Node = start;
  while (remaining.length > 0) {
    let best = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (edgeCost(current, remaining[i]) < edgeCost(current, remaining[best])) best = i;
    }
    current = remaining[best];
    order.push(...remaining.splice(best, 1));
  }
  return order;
}

/**
 * 2-opt for an open path with a fixed start (the walk does not return home).
 *
 * Reversing order[i..j] replaces edges (i-1,i) and (j,j+1) with (i-1,j) and
 * (i,j+1); edges inside the segment keep their cost because edgeCost is
 * symmetric. When j is the last stop there is no outgoing edge to replace.
 * Repeats until no reversal improves the cost.
 */
export function twoOpt(start: LatLng, initial: Poi[]): Poi[] {
  const order = [...initial];
  const n = order.length;
  const at = (i: number): Node => (i < 0 ? start : order[i]);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const before = edgeCost(at(i - 1), order[i]) + (j + 1 < n ? edgeCost(order[j], order[j + 1]) : 0);
        const after = edgeCost(at(i - 1), order[j]) + (j + 1 < n ? edgeCost(order[i], order[j + 1]) : 0);
        if (after < before - 1e-6) {
          for (let a = i, b = j; a < b; a++, b--) [order[a], order[b]] = [order[b], order[a]];
          improved = true;
        }
      }
    }
  }
  return order;
}

export function orderStops(start: LatLng, stops: Poi[]): Poi[] {
  return twoOpt(start, nearestNeighbor(start, stops));
}
