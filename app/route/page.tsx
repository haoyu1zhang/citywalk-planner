import { Suspense } from "react";
import { RouteView } from "@/components/RouteView";

export default function RoutePage() {
  // useSearchParams needs a Suspense boundary during prerendering.
  return (
    <Suspense fallback={null}>
      <RouteView />
    </Suspense>
  );
}
