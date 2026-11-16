import { haversine } from "@/lib/geo";
import type { Category, LatLng, Poi } from "@/types";

const normalise = (name: string) => name.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Drops what can never be a stop: wrong category, no name, too far from the
 * start, and duplicates (same OSM id, or the same name mapped twice — OSM often
 * has a node and a building way for one place; the better-tagged one wins).
 */
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
  // Stable order so the same input always yields the same route.
  return [...byName.values()].sort((a, b) => a.id.localeCompare(b.id));
}
