import type { LatLng } from "@/types";

export interface City {
  id: string;
  name: string;
  /** Appended to geocoding queries to keep results in the right city. */
  query: string;
  center: LatLng;
  startLabel: string;
}

// Default starts are well-known squares in the walkable historic centre.
export const CITIES: City[] = [
  { id: "rome", name: "罗马", query: "Roma", center: { lat: 41.8986, lng: 12.4769 }, startLabel: "万神殿" },
  { id: "florence", name: "佛罗伦萨", query: "Firenze", center: { lat: 43.7696, lng: 11.2558 }, startLabel: "领主广场" },
  { id: "milan", name: "米兰", query: "Milano", center: { lat: 45.4642, lng: 9.19 }, startLabel: "主教座堂广场" },
  { id: "venice", name: "威尼斯", query: "Venezia", center: { lat: 45.4371, lng: 12.3326 }, startLabel: "圣保罗广场" },
  { id: "bologna", name: "博洛尼亚", query: "Bologna", center: { lat: 44.4939, lng: 11.3428 }, startLabel: "马焦雷广场" },
];

/** Accepts an id ("rome") or a display/native name ("罗马", "Roma"). */
export function findCity(input: string): City | undefined {
  const key = input.trim().toLowerCase();
  return CITIES.find(
    (c) => c.id === key || c.name === input.trim() || c.query.toLowerCase() === key,
  );
}
