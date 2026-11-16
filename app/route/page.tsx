import { Suspense } from "react";
import { RouteView } from "@/components/RouteView";

export const metadata = { title: "你的漫步路线 · CityWalk Planner" };

export default function RoutePage() {
  // useSearchParams needs a Suspense boundary during prerendering.
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted">加载中…</p>}>
      <RouteView />
    </Suspense>
  );
}
