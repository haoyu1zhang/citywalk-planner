import { Suspense } from "react";
import { RouteView } from "@/components/RouteView";

export default function RoutePage() {
  // useSearchParams needs a Suspense boundary
  return (
    <Suspense fallback={null}>
      <RouteView />
    </Suspense>
  );
}
