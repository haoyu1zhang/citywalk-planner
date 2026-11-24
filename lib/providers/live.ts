import { createOverpassProvider } from "./overpass";
import { createPhotonProvider } from "./photon";
import type { PoiProvider } from "./types";

/** Tries each provider in turn; the first one that answers wins. */
export function chainPoiProviders(providers: PoiProvider[]): PoiProvider {
  async function first<T>(call: (p: PoiProvider) => Promise<T>): Promise<T> {
    let lastError: unknown = new Error("no providers");
    for (const p of providers) {
      try {
        return await call(p);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }
  return {
    name: providers.map((p) => p.name).join(">"),
    search: (query) => first((p) => p.search(query)),
    byIds: (ids) => first((p) => p.byIds(ids)),
  };
}

// Photon first: the public Overpass servers have been unreliable for weeks.
export function createLivePoiProvider(): PoiProvider {
  return chainPoiProviders([createPhotonProvider(), createOverpassProvider()]);
}
