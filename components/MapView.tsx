"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { LatLng, RouteResponse, RouteStop } from "@/types";

export interface MapViewProps {
  center: LatLng;
  zoom?: number;
  start?: LatLng | null;
  /** When set, clicking the map picks a start point. */
  onPick?: (point: LatLng) => void;
  stops?: RouteStop[];
  geometry?: RouteResponse["geometry"];
  activeStopId?: string | null;
  onStopSelect?: (id: string) => void;
}

// divIcons avoid Leaflet's default image markers, whose asset paths break
// under bundlers.
const startIcon = L.divIcon({ className: "", html: '<div class="cw-start"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });

function numberedIcon(n: number, active: boolean) {
  return L.divIcon({
    className: "",
    html: `<div class="cw-marker" data-active="${active}">${n}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function ClickToPick({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

/** Keeps the viewport in sync: fit the route if there is one, else follow the centre. */
function Viewport({ center, geometry }: Pick<MapViewProps, "center" | "geometry">) {
  const map = useMap();
  useEffect(() => {
    if (geometry) {
      const bounds = L.latLngBounds(geometry.coordinates.map(([lng, lat]) => [lat, lng]));
      map.fitBounds(bounds, { padding: [36, 36] });
    } else {
      map.setView([center.lat, center.lng]);
    }
  }, [map, center.lat, center.lng, geometry]);
  return null;
}

export default function MapView({
  center,
  zoom = 15,
  start,
  onPick,
  stops = [],
  geometry,
  activeStopId,
  onStopSelect,
}: MapViewProps) {
  const line = useMemo(
    () => geometry?.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
    [geometry],
  );

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={zoom}
      scrollWheelZoom
      className="h-full w-full"
      style={{ cursor: onPick ? "crosshair" : undefined }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <Viewport center={center} geometry={geometry} />
      {onPick && <ClickToPick onPick={onPick} />}
      {line && (
        <>
          <Polyline positions={line} pathOptions={{ color: "#ffffff", weight: 8, opacity: 0.9 }} />
          <Polyline
            positions={line}
            className="cw-route-line"
            pathOptions={{ color: "#0f5e63", weight: 4.5, opacity: 0.95 }}
          />
        </>
      )}
      {start && (
        <Marker position={[start.lat, start.lng]} icon={startIcon} keyboard={false}>
          <Tooltip direction="top" offset={[0, -8]}>
            起点
          </Tooltip>
        </Marker>
      )}
      {stops.map((stop, i) => (
        <Marker
          key={stop.id}
          position={[stop.lat, stop.lng]}
          icon={numberedIcon(i + 1, stop.id === activeStopId)}
          zIndexOffset={stop.id === activeStopId ? 1000 : 0}
          title={`${i + 1}. ${stop.name}`}
          eventHandlers={{ click: () => onStopSelect?.(stop.id) }}
        >
          <Tooltip direction="top" offset={[0, -14]}>
            {i + 1}. {stop.name}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
