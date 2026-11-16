import type { Category, EventItem, LatLng, Poi } from "@/types";

export interface PoiQuery {
  center: LatLng;
  radiusMeters: number;
  categories: Category[];
}

export interface PoiProvider {
  readonly name: string;
  search(query: PoiQuery): Promise<Poi[]>;
  byIds(ids: string[]): Promise<Poi[]>;
}

export interface RoutedPath {
  geometry: { type: "LineString"; coordinates: [number, number][] };
  distanceMeters: number;
}

export interface RoutingProvider {
  readonly name: string;
  walk(points: LatLng[]): Promise<RoutedPath>;
}

export interface EventQuery {
  center: LatLng;
  radiusKm: number;
  from: string;
  to: string;
  keyword?: string;
  category?: EventItem["category"];
}

export interface EventProvider {
  readonly name: string;
  search(query: EventQuery): Promise<EventItem[]>;
  byIds(ids: string[]): Promise<EventItem[]>;
}
