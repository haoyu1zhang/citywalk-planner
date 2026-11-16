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
export const STOP_CATEGORIES = [...CATEGORIES, "event"] as const;
export const EVENT_CATEGORIES = ["music", "arts", "sports", "film", "family", "other"] as const;

type Theme = (typeof THEMES)[number];
type Category = (typeof CATEGORIES)[number];
type Duration = (typeof DURATIONS)[number];

interface ThemeConfig {
  primary: Category[];
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
  // date mode ignores primary/secondary, see lib/route/date.ts
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
  // there are far too many restaurants and bars; require a couple of extra tags
  restaurant: '["amenity"="restaurant"]["cuisine"]["website"]',
  bar: '["amenity"="bar"]["opening_hours"]',
  historic:
    '["historic"~"^(monument|memorial|castle|ruins|archaeological_site|church|fountain)$"]',
};

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
export const DISTANCE_TOLERANCE = 0.2;
export const MAX_DETOUR_FACTOR = 1.5;
export const STREET_FACTOR = 1.3;

export const STOP_COUNT: Record<Duration, number> = { 30: 3, 60: 5, 90: 6, 120: 7 };

export function targetMeters(durationMinutes: number): number {
  return (durationMinutes / 60) * WALK_SPEED_KMH * 1000;
}

export function walkMinutes(meters: number): number {
  return Math.round((meters / 1000 / WALK_SPEED_KMH) * 60);
}
