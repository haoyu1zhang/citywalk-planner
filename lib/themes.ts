export const THEMES = ["classic", "coffee", "art", "park", "photo", "rainy"] as const;
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
] as const;

type Theme = (typeof THEMES)[number];
type Category = (typeof CATEGORIES)[number];
type Duration = (typeof DURATIONS)[number];

interface ThemeConfig {
  label: string;
  hint: string;
  /** What the walk is about. */
  primary: Category[];
  /** Fillers that keep the walk varied; never more than one each. */
  secondary: Category[];
}

export const THEME_CONFIG: Record<Theme, ThemeConfig> = {
  classic: {
    label: "经典",
    hint: "地标、古迹、博物馆",
    primary: ["attraction", "historic", "museum"],
    secondary: ["cafe", "park"],
  },
  coffee: {
    label: "咖啡",
    hint: "咖啡馆为主,穿插歇脚处",
    primary: ["cafe"],
    secondary: ["park", "bookshop", "attraction", "historic"],
  },
  art: {
    label: "文艺",
    hint: "书店、图书馆、画廊",
    primary: ["bookshop", "library", "art_gallery"],
    secondary: ["museum", "cafe"],
  },
  park: {
    label: "公园",
    hint: "公园与花园",
    primary: ["park"],
    secondary: ["viewpoint", "cafe", "attraction", "historic"],
  },
  photo: {
    label: "拍照",
    hint: "观景点和出片的地方",
    primary: ["viewpoint", "attraction"],
    secondary: ["historic", "park", "cafe"],
  },
  rainy: {
    label: "雨天",
    hint: "只去室内",
    primary: ["museum", "art_gallery", "bookshop", "library", "cafe"],
    secondary: [],
  },
};

export const CATEGORY_LABEL: Record<Category, string> = {
  cafe: "咖啡馆",
  park: "公园",
  bookshop: "书店",
  library: "图书馆",
  art_gallery: "画廊",
  viewpoint: "观景点",
  attraction: "景点",
  historic: "古迹",
  museum: "博物馆",
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
};

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
  historic:
    '["historic"~"^(monument|memorial|castle|ruins|archaeological_site|church|fountain)$"]',
};

/** OSM tags → our category. Order matters: the most specific tag wins. */
export function categoryFromTags(tags: Record<string, string>): Category | null {
  if (tags.amenity === "cafe") return "cafe";
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
