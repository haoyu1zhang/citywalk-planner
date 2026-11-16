import { createSnapshotProvider } from "./snapshot";
import { createTicketmasterProvider } from "./ticketmaster";
import type { EventProvider } from "./types";

/** Merges several sources. One failing source does not hide the others. */
export function combineEventProviders(providers: EventProvider[]): EventProvider {
  return {
    name: providers.map((p) => p.name).join("+"),
    async search(query) {
      const results = await Promise.allSettled(providers.map((p) => p.search(query)));
      const ok = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
      if (ok.length === 0 && results.every((r) => r.status === "rejected")) {
        throw new Error("all event sources failed");
      }
      return ok.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    },
    async byIds(ids) {
      const results = await Promise.allSettled(providers.map((p) => p.byIds(ids)));
      const found = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
      return ids.flatMap((id) => found.find((e) => e.id === id) ?? []);
    },
  };
}

export function createEventProvider(): EventProvider {
  const ticketmaster = process.env.CITYWALK_OFFLINE === "1" ? null : createTicketmasterProvider();
  return combineEventProviders([createSnapshotProvider(), ...(ticketmaster ? [ticketmaster] : [])]);
}
