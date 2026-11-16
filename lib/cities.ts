import type { LatLng } from "@/types";

export interface City {
  id: string;
  query: string;
  center: LatLng;
}

export const CITIES: City[] = [
  { id: "rome", query: "Roma", center: { lat: 41.8986, lng: 12.4769 } },
  { id: "florence", query: "Firenze", center: { lat: 43.7696, lng: 11.2558 } },
  { id: "milan", query: "Milano", center: { lat: 45.4642, lng: 9.19 } },
  { id: "venice", query: "Venezia", center: { lat: 45.4371, lng: 12.3326 } },
  { id: "bologna", query: "Bologna", center: { lat: 44.4939, lng: 11.3428 } },
];

export function findCity(input: string): City | undefined {
  const key = input.trim().toLowerCase();
  return CITIES.find(
    (c) => c.id === key || c.query.toLowerCase() === key,
  );
}
