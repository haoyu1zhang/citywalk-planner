"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window` at import time, so the map is client-only.
const LazyMap = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center bg-line/50 text-sm text-muted">
      地图加载中…
    </div>
  ),
});

export default LazyMap;
