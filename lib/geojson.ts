import type { FeatureCollection } from "geojson";
import type { RouteResponse } from "@/types";

/** The route as a FeatureCollection: one LineString plus one Point per stop. */
export function toGeoJSON(route: RouteResponse): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: route.geometry,
        properties: {
          routeId: route.routeId,
          distanceMeters: route.summary.distanceMeters,
          walkMinutes: route.summary.durationMinutes,
          attribution: "© OpenStreetMap contributors (ODbL)",
        },
      },
      ...route.stops.map((stop, index) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [stop.lng, stop.lat] },
        properties: {
          order: index + 1,
          name: stop.name,
          category: stop.category,
          suggestedStayMinutes: stop.suggestedStayMinutes,
          osmUrl: stop.osmUrl,
          ...(stop.event ? { eventUrl: stop.event.url, startsAt: stop.event.startsAt, venue: stop.event.venue } : {}),
        },
      })),
    ],
  };
}
