import { z } from "zod";
import { CATEGORIES, DURATIONS, EVENT_CATEGORIES, STOP_CATEGORIES, THEMES } from "@/lib/themes";

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const osmIdSchema = z.string().regex(/^(node|way|relation)\/\d+$/);
const eventIdSchema = z.string().regex(/^event\/[A-Za-z0-9_-]{1,40}$/);
const stopIdSchema = z.union([osmIdSchema, eventIdSchema]);

export const eventSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  name: z.string().min(1),
  url: z.string().url(),
  /** Local time at the venue: "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm". */
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/),
  category: z.enum(EVENT_CATEGORIES),
  venue: z.string(),
  lat: z.number(),
  lng: z.number(),
  /** Last day, for exhibitions and other things that run for a while. */
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priceFrom: z.number().nonnegative().optional(),
  currency: z.string().optional(),
  source: z.enum(["ezine", "ticketmaster"]),
});
export type EventItem = z.infer<typeof eventSchema>;

export const eventsResponseSchema = z.object({ events: z.array(eventSchema) });

export const poiSchema = z.object({
  id: osmIdSchema,
  name: z.string().min(1),
  category: z.enum(CATEGORIES),
  lat: z.number(),
  lng: z.number(),
  /** Number of OSM tags: a cheap proxy for how well-documented a place is. */
  tagCount: z.number().int().nonnegative(),
});

export const placesResponseSchema = z.object({ places: z.array(poiSchema.omit({ tagCount: true })) });
export type Place = z.infer<typeof placesResponseSchema>["places"][number];

export const routeRequestSchema = z.object({
  city: z.string().min(1).max(80),
  start: latLngSchema,
  durationMinutes: z.union(DURATIONS.map((d) => z.literal(d))),
  theme: z.enum(THEMES),
  stopIds: z.array(stopIdSchema).min(1).max(12).optional(),
  seed: z.number().int().min(0).max(9999).optional(),
});

export const routeStopSchema = z.object({
  id: stopIdSchema,
  name: z.string(),
  category: z.enum(STOP_CATEGORIES),
  lat: z.number(),
  lng: z.number(),
  suggestedStayMinutes: z.number().int().positive(),
  osmUrl: z.string().url(),
  event: eventSchema.pick({ startsAt: true, endsAt: true, url: true, venue: true, category: true }).optional(),
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

export const WARNING_CODES = [
  "FALLBACK_POIS",
  "OFFLINE",
  "STRAIGHT_LINES",
  "PINNED_MISSING",
  "EVENT_UNAVAILABLE",
  "FEW_PLACES",
  "SHORTER_THAN_TARGET",
  "DETOUR_TRIMMED",
  "LONGER_THAN_TARGET",
] as const;
export type WarningCode = (typeof WARNING_CODES)[number];

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(["BAD_REQUEST", "NO_RESULTS", "POI_UNAVAILABLE", "EVENTS_UNAVAILABLE", "INTERNAL"]),
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
