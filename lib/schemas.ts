import { z } from "zod";
import { CATEGORIES, DURATIONS, THEMES } from "@/lib/themes";

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const osmIdSchema = z.string().regex(/^(node|way|relation)\/\d+$/);

export const poiSchema = z.object({
  id: osmIdSchema,
  name: z.string().min(1),
  category: z.enum(CATEGORIES),
  lat: z.number(),
  lng: z.number(),
  /** Number of OSM tags: a cheap proxy for how well-documented a place is. */
  tagCount: z.number().int().nonnegative(),
});

export const routeRequestSchema = z.object({
  city: z.string().min(1).max(80),
  start: latLngSchema,
  durationMinutes: z.union(DURATIONS.map((d) => z.literal(d))),
  theme: z.enum(THEMES),
  /** Shared links pin the exact stops (in order) so they reproduce. */
  stopIds: z.array(osmIdSchema).min(1).max(12).optional(),
  /** Bumped by "重新生成" to get a different but still deterministic pick. */
  seed: z.number().int().min(0).max(9999).optional(),
});

export const routeStopSchema = z.object({
  id: osmIdSchema,
  name: z.string(),
  category: z.enum(CATEGORIES),
  lat: z.number(),
  lng: z.number(),
  suggestedStayMinutes: z.number().int().positive(),
  osmUrl: z.string().url(),
});

export const lineStringSchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
});

export const routeResponseSchema = z.object({
  routeId: z.string(),
  summary: z.object({
    distanceMeters: z.number().nonnegative(),
    durationMinutes: z.number().nonnegative(),
    stopCount: z.number().int().nonnegative(),
  }),
  stops: z.array(routeStopSchema),
  geometry: lineStringSchema,
  warnings: z.array(z.string()),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(["BAD_REQUEST", "NO_RESULTS", "POI_UNAVAILABLE", "INTERNAL"]),
    message: z.string(),
  }),
});
export type ApiErrorCode = z.infer<typeof apiErrorSchema>["error"]["code"];

export const geocodeResultSchema = z.object({
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
});
export const geocodeResponseSchema = z.object({ results: z.array(geocodeResultSchema) });
export type GeocodeResult = z.infer<typeof geocodeResultSchema>;
