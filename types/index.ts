// Domain types. They are inferred from the Zod schemas in lib/schemas.ts so
// the runtime validation and the compile-time types can never drift apart.
import type { z } from "zod";
import type {
  latLngSchema,
  poiSchema,
  routeRequestSchema,
  routeResponseSchema,
  routeStopSchema,
} from "@/lib/schemas";
import type { CATEGORIES, DURATIONS, THEMES } from "@/lib/themes";

export type LatLng = z.infer<typeof latLngSchema>;
export type Theme = (typeof THEMES)[number];
export type Category = (typeof CATEGORIES)[number];
export type Duration = (typeof DURATIONS)[number];

/** A candidate place, normalised from OSM. `id` looks like "node/123". */
export type Poi = z.infer<typeof poiSchema>;
export type RouteStop = z.infer<typeof routeStopSchema>;
export type RouteRequest = z.infer<typeof routeRequestSchema>;
export type RouteResponse = z.infer<typeof routeResponseSchema>;

/** Internal result of the planning algorithm, before real routing. */
export interface RoutePlan {
  start: LatLng;
  stops: Poi[];
  targetMeters: number;
  /** Straight-line length × street factor; replaced by the routed length. */
  estimatedMeters: number;
  warnings: string[];
}
