import type { Category, LatLng, Poi } from "@/types";

export const ORIGIN: LatLng = { lat: 41.9, lng: 12.48 };

const M_PER_DEG_LAT = 111_320;

/** A point `east`/`north` metres from ORIGIN: lets tests think in metres. */
export function at(east: number, north: number): LatLng {
  return {
    lat: ORIGIN.lat + north / M_PER_DEG_LAT,
    lng: ORIGIN.lng + east / (M_PER_DEG_LAT * Math.cos((ORIGIN.lat * Math.PI) / 180)),
  };
}

let counter = 0;
export function poi(east: number, north: number, category: Category = "cafe", extra: Partial<Poi> = {}): Poi {
  counter += 1;
  return { id: `node/${counter}`, name: `Place ${counter}`, category, tagCount: 5, ...at(east, north), ...extra };
}

/** A ring of candidates, mixed categories, `radius` metres out. */
export function ring(n: number, radius: number, categories: Category[]): Poi[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return poi(Math.cos(a) * radius, Math.sin(a) * radius, categories[i % categories.length]);
  });
}
