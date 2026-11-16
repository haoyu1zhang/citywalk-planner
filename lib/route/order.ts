import { haversine } from "@/lib/geo";
import type { LatLng } from "@/types";

// Same-category neighbours cost this many extra metres, so both nearest-neighbour
// and 2-opt avoid cafe, cafe, cafe when the detour is small.
export const SAME_CATEGORY_PENALTY_M = 150;

type Node = LatLng & { category?: string };
type Stop = LatLng & { category: string };

export function edgeCost(a: Node, b: Node): number {
  const same = a.category !== undefined && a.category === b.category;
  return haversine(a, b) + (same ? SAME_CATEGORY_PENALTY_M : 0);
}

export function pathCost(start: LatLng, stops: Stop[]): number {
  let cost = 0;
  let prev: Node = start;
  for (const stop of stops) {
    cost += edgeCost(prev, stop);
    prev = stop;
  }
  return cost;
}

export function nearestNeighbor<T extends Stop>(start: LatLng, stops: T[]): T[] {
  const remaining = [...stops];
  const order: T[] = [];
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

// 2-opt on an open path with a fixed start. Reversing order[i..j] only changes the
// two boundary edges (edgeCost is symmetric); if j is the last stop there is no
// outgoing edge.
export function twoOpt<T extends Stop>(start: LatLng, initial: T[]): T[] {
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

export function orderStops<T extends Stop>(start: LatLng, stops: T[]): T[] {
  return twoOpt(start, nearestNeighbor(start, stops));
}
