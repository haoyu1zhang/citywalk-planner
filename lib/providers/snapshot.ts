import { z } from "zod";
import snapshot from "@/data/events.json";
import { haversine } from "@/lib/geo";
import { eventSchema } from "@/lib/schemas";
import type { EventItem } from "@/types";
import type { EventProvider } from "./types";

// data/events.json is refreshed daily by scripts/update-events.ts

const fileSchema = z.object({ updatedAt: z.string(), events: z.array(eventSchema) });

let cached: EventItem[] | null = null;
function load(): EventItem[] {
  cached ??= fileSchema.parse(snapshot).events;
  return cached;
}

const day = (startsAt: string) => startsAt.slice(0, 10);

export function createSnapshotProvider(events: EventItem[] = load()): EventProvider {
  return {
    name: "snapshot",
    async search({ center, radiusKm, from, to, keyword, category }) {
      const needle = keyword?.trim().toLowerCase();
      return events.filter((e) => {
        // overlaps [from, to]: exhibitions count for as long as they run
        if (day(e.startsAt) > to || (e.endsAt ?? day(e.startsAt)) < from) return false;
        if (category && e.category !== category) return false;
        if (needle && !`${e.name} ${e.venue}`.toLowerCase().includes(needle)) return false;
        return haversine(center, e) <= radiusKm * 1000;
      });
    },
    async byIds(ids) {
      return ids.flatMap((id) => events.find((e) => e.id === id) ?? []);
    },
  };
}
