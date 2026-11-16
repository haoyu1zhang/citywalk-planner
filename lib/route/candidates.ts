import { haversine } from "@/lib/geo";
import type { Category, LatLng, Poi } from "@/types";

const normalise = (name: string) => name.toLowerCase().replace(/\s+/g, " ").trim();

// Drops off-theme, unnamed, far-away and duplicate places. OSM often has a node
// and a building way for the same shop; the better-tagged one wins.
export function filterCandidates(
  pois: Poi[],
  start: LatLng,
  radiusMeters: number,
  categories: Category[],
): Poi[] {
  const byName = new Map<string, Poi>();
  const seenIds = new Set<string>();
  for (const poi of pois) {
    if (seenIds.has(poi.id)) continue;
    seenIds.add(poi.id);
    if (!poi.name.trim()) continue;
    if (!categories.includes(poi.category)) continue;
    if (haversine(start, poi) > radiusMeters) continue;
    const key = normalise(poi.name);
    const existing = byName.get(key);
    if (!existing || poi.tagCount > existing.tagCount) byName.set(key, poi);
  }
  // stable order => same input, same route
  return [...byName.values()].sort((a, b) => a.id.localeCompare(b.id));
}
