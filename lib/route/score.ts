import { haversine } from "@/lib/geo";
import { THEME_CONFIG } from "@/lib/themes";
import type { Category, LatLng, Poi, Theme } from "@/types";

export const WEIGHTS = {
  primary: 3,
  secondary: 1,
  richness: 1,
  diversity: 1,
  detour: 1.5,
  consecutive: 1.5,
  jitter: 1.2,
};

export interface ScoreContext {
  theme: Theme;
  from: LatLng;
  lastCategory: Category | null;
  pickedCategories: ReadonlySet<Category>;
  idealLegMeters: number;
  seed: number;
}

export function jitter(id: string, seed: number): number {
  if (seed === 0) return 0;
  let h = 2166136261 ^ seed;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  return ((Math.imul(h, 2246822507) >>> 0) % 10_000) / 10_000;
}

/**
 * score = theme match + tag richness + diversity bonus
 *         − detour penalty − consecutive-same-category penalty
 *
 * detour is measured against the ideal leg length, not zero
 */
export function scorePoi(poi: Poi, ctx: ScoreContext): number {
  const cfg = THEME_CONFIG[ctx.theme];
  const themeMatch = cfg.primary.includes(poi.category)
    ? WEIGHTS.primary
    : cfg.secondary.includes(poi.category)
      ? WEIGHTS.secondary
      : 0;
  const richness = (Math.min(poi.tagCount, 15) / 15) * WEIGHTS.richness;
  const diversity = ctx.pickedCategories.has(poi.category) ? 0 : WEIGHTS.diversity;
  const legError = Math.abs(haversine(ctx.from, poi) - ctx.idealLegMeters) / ctx.idealLegMeters;
  const detour = Math.min(legError, 2) * WEIGHTS.detour;
  const consecutive = ctx.lastCategory === poi.category ? WEIGHTS.consecutive : 0;
  return (
    themeMatch + richness + diversity - detour - consecutive + jitter(poi.id, ctx.seed) * WEIGHTS.jitter
  );
}
