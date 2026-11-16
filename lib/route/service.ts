import { createHash } from "node:crypto";
import { roundCoord } from "@/lib/geo";
import type { PoiProvider, RoutedPath, RoutingProvider } from "@/lib/providers/types";
import { MAX_DETOUR_FACTOR, STAY_MINUTES, targetMeters, themeCategories, walkMinutes } from "@/lib/themes";
import type { LatLng, Poi, RouteRequest, RouteResponse, RouteStop } from "@/types";
import { estimateMeters, MIN_STOPS, dropCostliestStop, planRoute, searchRadius } from "./plan";
import { orderStops } from "./order";

export type RouteErrorCode = "NO_RESULTS" | "POI_UNAVAILABLE";

export class RouteError extends Error {
  constructor(
    readonly code: RouteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RouteError";
  }
}

export interface RouteDeps {
  pois: PoiProvider;
  /** Used when `pois` fails. Optional so tests can exercise the hard failure. */
  fallbackPois?: PoiProvider;
  /** null = offline mode: skip routing and draw straight lines. */
  routing: RoutingProvider | null;
}

const FALLBACK_WARNING = "实时地点数据暂时不可用,当前使用的是内置示例数据。";
const OFFLINE_WARNING = "离线演示模式:地点来自内置的 OpenStreetMap 数据快照,路线为直线连接,距离为估算值。";
const STRAIGHT_WARNING = "步行路由服务暂时不可用,地图上是直线连接,距离为估算值。";

function toStop(poi: Poi): RouteStop {
  return {
    id: poi.id,
    name: poi.name,
    category: poi.category,
    lat: poi.lat,
    lng: poi.lng,
    suggestedStayMinutes: STAY_MINUTES[poi.category],
    osmUrl: `https://www.openstreetmap.org/${poi.id}`,
  };
}

function straightPath(points: LatLng[]): RoutedPath {
  return {
    geometry: { type: "LineString", coordinates: points.map((p) => [p.lng, p.lat]) },
    distanceMeters: estimateMeters(points[0], points.slice(1)),
  };
}

/** Tries the live provider, then the fixture. Reports which one answered. */
async function withFallback<T>(
  deps: RouteDeps,
  call: (p: PoiProvider) => Promise<T[]>,
): Promise<{ items: T[]; usedFallback: boolean; liveFailed: boolean }> {
  try {
    return { items: await call(deps.pois), usedFallback: false, liveFailed: false };
  } catch {
    if (!deps.fallbackPois) return { items: [], usedFallback: false, liveFailed: true };
    return { items: await call(deps.fallbackPois), usedFallback: true, liveFailed: true };
  }
}

export async function generateRoute(req: RouteRequest, deps: RouteDeps): Promise<RouteResponse> {
  const warnings: string[] = [];
  const target = targetMeters(req.durationMinutes);
  let stops: Poi[] | null = null;

  // 1. A shared link pins its stops: load exactly those, in the given order.
  if (req.stopIds) {
    const ids = req.stopIds;
    const { items, usedFallback } = await withFallback(deps, (p) => p.byIds(ids));
    if (items.length === ids.length) {
      stops = items;
      if (usedFallback && deps.pois.name !== "fixture") warnings.push(FALLBACK_WARNING);
    } else {
      warnings.push("链接里的部分站点已无法找到,已为你重新规划路线。");
    }
  }

  // 2. Otherwise plan from scratch.
  if (!stops) {
    const query = {
      center: req.start,
      radiusMeters: searchRadius(req.durationMinutes),
      categories: themeCategories(req.theme),
    };
    const { items, usedFallback, liveFailed } = await withFallback(deps, (p) => p.search(query));
    if (liveFailed && !usedFallback) {
      throw new RouteError("POI_UNAVAILABLE", "地点数据服务(Overpass)暂时没有响应,请稍后再试。");
    }
    if (usedFallback) {
      if (items.length === 0) {
        throw new RouteError(
          "POI_UNAVAILABLE",
          "地点数据服务(Overpass)暂时没有响应,而这个位置不在内置示例数据的范围内。请稍后再试,或换一个预设城市。",
        );
      }
      warnings.push(FALLBACK_WARNING);
    }
    const plan = planRoute(items, { ...req, seed: req.seed });
    stops = plan.stops;
    warnings.push(...plan.warnings);
  }

  if (stops.length < (req.stopIds ? 1 : MIN_STOPS)) {
    throw new RouteError("NO_RESULTS", "这个起点附近没有找到足够的地点。试试换个主题、延长时间,或把起点移到市中心。");
  }

  // 3. Real walking path. One routing call per attempt, at most three attempts:
  //    if the streets make the walk exceed the hard detour limit, drop the
  //    costliest stop and try again.
  let path: RoutedPath | null = null;
  if (deps.routing) {
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        path = await deps.routing.walk([req.start, ...stops]);
        const tooLong = path.distanceMeters > target * MAX_DETOUR_FACTOR;
        if (!tooLong || stops.length <= MIN_STOPS || attempt === 2) break;
        stops = orderStops(req.start, dropCostliestStop(req.start, stops));
        if (attempt === 0) warnings.push("实际步行距离超出目标太多,已去掉最绕路的站点。");
      }
    } catch {
      path = null;
      warnings.push(STRAIGHT_WARNING);
    }
  }
  if (!deps.routing) warnings.push(OFFLINE_WARNING);
  path ??= straightPath([req.start, ...stops]);
  if (path.distanceMeters > target * MAX_DETOUR_FACTOR) {
    warnings.push("这条路线比所选时长明显更长,可以删掉一两站。");
  }

  const routeId = createHash("sha1")
    .update(
      JSON.stringify([
        roundCoord(req.start.lat),
        roundCoord(req.start.lng),
        req.durationMinutes,
        req.theme,
        stops.map((s) => s.id),
      ]),
    )
    .digest("hex")
    .slice(0, 12);

  return {
    routeId,
    summary: {
      distanceMeters: Math.round(path.distanceMeters),
      durationMinutes: walkMinutes(path.distanceMeters),
      stopCount: stops.length,
    },
    stops: stops.map(toStop),
    geometry: path.geometry,
    warnings: [...new Set(warnings)],
  };
}
