import { haversine } from "@/lib/geo";
import { LOCALE_TAG, type Locale } from "@/lib/i18n";
import type { LatLng } from "@/types";

export const EVENT_RANGES = ["today", "weekend", "week", "month"] as const;
export type EventRange = (typeof EVENT_RANGES)[number];

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function dateRange(range: EventRange, today = new Date()): { from: string; to: string } {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const plus = (days: number) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + days);
  if (range === "today") return { from: isoDate(start), to: isoDate(start) };
  if (range === "week") return { from: isoDate(start), to: isoDate(plus(7)) };
  if (range === "month") return { from: isoDate(start), to: isoDate(plus(30)) };
  // Weekend: the coming Saturday and Sunday, or what is left of the current one.
  const day = start.getDay(); // 0 = Sunday
  if (day === 0) return { from: isoDate(start), to: isoDate(start) };
  return { from: isoDate(day === 6 ? start : plus(6 - day)), to: isoDate(plus(7 - day)) };
}

export function formatEventDate(startsAt: string, locale: Locale): string {
  const hasTime = startsAt.includes("T");
  const date = new Date(hasTime ? startsAt : `${startsAt}T00:00`);
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(hasTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

/** Exhibitions show their run ("19 Nov – 19 Dec"), one-off events their date and time. */
export function formatEventWhen(event: { startsAt: string; endsAt?: string }, locale: Locale): string {
  if (!event.endsAt) return formatEventDate(event.startsAt, locale);
  const day = new Intl.DateTimeFormat(LOCALE_TAG[locale], { day: "numeric", month: "short" });
  return `${day.format(new Date(`${event.startsAt.slice(0, 10)}T00:00`))} – ${day.format(new Date(`${event.endsAt}T00:00`))}`;
}

export function cheapestInsertion(start: LatLng, stops: LatLng[], point: LatLng): number {
  let best = stops.length;
  let bestAdded = Infinity;
  for (let i = 0; i <= stops.length; i++) {
    const prev = i === 0 ? start : stops[i - 1];
    const next = stops[i];
    const added = haversine(prev, point) + (next ? haversine(point, next) - haversine(prev, next) : 0);
    if (added < bestAdded) {
      bestAdded = added;
      best = i;
    }
  }
  return best;
}
