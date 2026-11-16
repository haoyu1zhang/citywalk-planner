export const THEMES = ["classic", "coffee", "art", "park", "photo", "rainy", "date"] as const;
export const DURATIONS = [30, 60, 90, 120] as const;
export const CATEGORIES = [
  "cafe",
  "park",
  "bookshop",
  "library",
  "art_gallery",
  "viewpoint",
  "attraction",
  "historic",
  "museum",
  "ice_cream",
  "restaurant",
  "bar",
] as const;
/** A stop is either an OSM place or an event the user added to the route. */
export const STOP_CATEGORIES = [...CATEGORIES, "event"] as const;
export const EVENT_CATEGORIES = ["music", "arts", "sports", "film", "family", "other"] as const;

type Theme = (typeof THEMES)[number];
type Category = (typeof CATEGORIES)[number];
type Duration = (typeof DURATIONS)[number];

// Labels live in lib/i18n/messages.ts (theme.<id>, themeHint.<id>).
interface ThemeConfig {
  /** What the walk is about. */
  primary: Category[];
  /** Fillers that keep the walk varied; never more than one each. */
  secondary: Category[];
}

export const THEME_CONFIG: Record<Theme, ThemeConfig> = {
  classic: {
    primary: ["attraction", "historic", "museum"],
    secondary: ["cafe", "park"],
  },
  coffee: {
    primary: ["cafe"],
    secondary: ["park", "bookshop", "attraction", "historic"],
  },
  art: {
    primary: ["bookshop", "library", "art_gallery"],
    secondary: ["museum", "cafe"],
  },
  park: {
    primary: ["park"],
    secondary: ["viewpoint", "cafe", "attraction", "historic"],
  },
  photo: {
    primary: ["viewpoint", "attraction"],
    secondary: ["historic", "park", "cafe"],
  },
  rainy: {
    primary: ["museum", "art_gallery", "bookshop", "library", "cafe"],
    secondary: [],
  },
  // Date mode does not rank by primary/secondary: lib/route/date.ts builds an
  // "arc" (something sweet → a stroll → a view → dinner or a drink).
  date: {
    primary: ["ice_cream", "cafe", "park", "viewpoint", "art_gallery", "bookshop", "attraction", "restaurant", "bar"],
    secondary: [],
  },
};

export const STAY_MINUTES: Record<Category, number> = {
  cafe: 20,
  park: 15,
  bookshop: 15,
  library: 10,
  art_gallery: 20,
  viewpoint: 10,
  attraction: 15,
  historic: 10,
  museum: 40,
  ice_cream: 10,
  restaurant: 75,
  bar: 40,
};
export const EVENT_STAY_MINUTES = 90;

/** Overpass tag filters per category. Kept next to the reverse mapping below. */
export const CATEGORY_FILTERS: Record<Category, string> = {
  cafe: '["amenity"="cafe"]',
  park: '["leisure"~"^(park|garden)$"]',
  bookshop: '["shop"="books"]',
  library: '["amenity"="library"]',
  art_gallery: '["tourism"="gallery"]',
  viewpoint: '["tourism"="viewpoint"]',
  attraction: '["tourism"="attraction"]',
  museum: '["tourism"="museum"]',
  ice_cream: '["amenity"="ice_cream"]',
  // Restaurants and bars are everywhere; asking for a few extra tags keeps the
  // result small and biased towards places someone bothered to document.
  restaurant: '["amenity"="restaurant"]["cuisine"]["website"]',
  bar: '["amenity"="bar"]["opening_hours"]',
  historic:
    '["historic"~"^(monument|memorial|castle|ruins|archaeological_site|church|fountain)$"]',
};

/** OSM tags → our category. Order matters: the most specific tag wins. */
export function categoryFromTags(tags: Record<string, string>): Category | null {
  if (tags.amenity === "cafe") return "cafe";
  if (tags.amenity === "ice_cream") return "ice_cream";
  if (tags.amenity === "restaurant") return "restaurant";
  if (tags.amenity === "bar") return "bar";
  if (tags.leisure === "park" || tags.leisure === "garden") return "park";
  if (tags.shop === "books") return "bookshop";
  if (tags.amenity === "library") return "library";
  if (tags.tourism === "gallery") return "art_gallery";
  if (tags.tourism === "viewpoint") return "viewpoint";
  if (tags.tourism === "museum") return "museum";
  if (tags.tourism === "attraction") return "attraction";
  if (tags.historic) return "historic";
  return null;
}

export function themeCategories(theme: Theme): Category[] {
  const c = THEME_CONFIG[theme];
  return [...c.primary, ...c.secondary];
}

export const WALK_SPEED_KMH = 4.5;
/** Target walking distance may float by this fraction. */
export const DISTANCE_TOLERANCE = 0.2;
/** Routed distance may never exceed target × this. */
export const MAX_DETOUR_FACTOR = 1.5;
/** Straight-line → street distance, used before real routing is known. */
export const STREET_FACTOR = 1.3;

export const STOP_COUNT: Record<Duration, number> = { 30: 3, 60: 5, 90: 6, 120: 7 };

export function targetMeters(durationMinutes: number): number {
  return (durationMinutes / 60) * WALK_SPEED_KMH * 1000;
}

export function walkMinutes(meters: number): number {
  return Math.round((meters / 1000 / WALK_SPEED_KMH) * 60);
}
