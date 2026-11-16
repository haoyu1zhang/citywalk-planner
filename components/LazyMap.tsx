"use client";

import dynamic from "next/dynamic";

// Leaflet needs window, so no SSR
const LazyMap = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-line/50" />,
});

export default LazyMap;
