import type { Category, LatLng, Poi } from "@/types";

export interface PoiQuery {
  center: LatLng;
  radiusMeters: number;
  categories: Category[];
}

/** Swap Overpass for anything else by implementing this. */
export interface PoiProvider {
  readonly name: string;
  search(query: PoiQuery): Promise<Poi[]>;
  /** Fetch specific elements, for reproducing a shared route. */
  byIds(ids: string[]): Promise<Poi[]>;
}

export interface RoutedPath {
  geometry: { type: "LineString"; coordinates: [number, number][] };
  distanceMeters: number;
}

/** Swap OSRM for Valhalla etc. by implementing this. */
export interface RoutingProvider {
  readonly name: string;
  walk(points: LatLng[]): Promise<RoutedPath>;
}
