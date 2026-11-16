// types come from the zod schemas in lib/schemas.ts
import type { z } from "zod";
import type {
  latLngSchema,
  poiSchema,
  routeRequestSchema,
  routeResponseSchema,
  routeStopSchema,
} from "@/lib/schemas";
import type { WarningCode } from "@/lib/schemas";
import type { CATEGORIES, DURATIONS, THEMES } from "@/lib/themes";

export type LatLng = z.infer<typeof latLngSchema>;
export type Theme = (typeof THEMES)[number];
export type Category = (typeof CATEGORIES)[number];
export type Duration = (typeof DURATIONS)[number];

export type Poi = z.infer<typeof poiSchema>;
export type RouteStop = z.infer<typeof routeStopSchema>;
export type RouteRequest = z.infer<typeof routeRequestSchema>;
export type RouteResponse = z.infer<typeof routeResponseSchema>;

export type { EventItem, WarningCode } from "@/lib/schemas";

export interface RoutePlan {
  start: LatLng;
  stops: Poi[];
  targetMeters: number;
  estimatedMeters: number;
  warnings: WarningCode[];
}
