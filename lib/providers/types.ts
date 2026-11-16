import type { Category, EventItem, LatLng, Poi } from "@/types";

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

export interface EventQuery {
  center: LatLng;
  radiusKm: number;
  /** Inclusive local dates, "YYYY-MM-DD". */
  from: string;
  to: string;
  keyword?: string;
  category?: EventItem["category"];
}

/** Swap Ticketmaster for another source by implementing this. */
export interface EventProvider {
  readonly name: string;
  search(query: EventQuery): Promise<EventItem[]>;
  /** Fetch specific events, for reproducing a shared route. Unknown ids are omitted. */
  byIds(ids: string[]): Promise<EventItem[]>;
}
