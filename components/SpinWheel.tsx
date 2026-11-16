"use client";

import { LoaderCircle, Plus, RotateCw, Shuffle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { haversine } from "@/lib/geo";
import { placesResponseSchema, type Place } from "@/lib/schemas";
import { encodeStopIds } from "@/lib/share";
import { formatKm } from "@/lib/utils";
import type { RouteRequest } from "@/types";

const COLORS = ["#b8451f", "#0f5e63", "#c98a1b", "#5f7a33", "#8c3b5e", "#2f6f9f", "#a3562b", "#4a5a6a"];
const SPIN_MS = 3600;
const R = 96;

type State = { status: "loading" } | { status: "ready"; places: Place[] } | { status: "error" };

function slicePath(index: number, count: number): string {
  const a0 = (index / count) * 2 * Math.PI - Math.PI / 2;
  const a1 = ((index + 1) / count) * 2 * Math.PI - Math.PI / 2;
  const p = (a: number) => `${(R * Math.cos(a)).toFixed(2)} ${(R * Math.sin(a)).toFixed(2)}`;
  return `M0 0 L${p(a0)} A${R} ${R} 0 0 1 ${p(a1)} Z`;
}

const shorten = (name: string) => (name.length > 15 ? `${name.slice(0, 14)}…` : name);

interface Props {
  req: RouteRequest;
  stopIds: string[];
  canAdd: boolean;
  onAdd: (place: Place) => void;
}

export function SpinWheel({ req, stopIds, canAdd, onAdd }: Props) {
  const { t, locale } = useI18n();
  const [state, setState] = useState<State>({ status: "loading" });
  const [round, setRound] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const exclude = encodeStopIds(stopIds);
  const { lat, lng } = req.start;

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      d: String(req.durationMinutes),
      theme: req.theme,
      n: "8",
    });
    if (exclude) params.set("exclude", exclude);
    setState({ status: "loading" });
    setWinner(null);
    fetch(`/api/places?${params}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("places failed");
        setState({ status: "ready", places: placesResponseSchema.parse(await res.json()).places });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });
    return () => controller.abort();
  }, [lat, lng, req.durationMinutes, req.theme, exclude, round]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const places = state.status === "ready" ? state.places : [];

  function spin() {
    if (spinning || places.length < 2) return;
    const pick = Math.floor(Math.random() * places.length);
    const slice = 360 / places.length;
    // land the middle of the picked slice under the pointer, after five full turns
    const target = Math.ceil(rotation / 360) * 360 + 5 * 360 + (360 - (pick + 0.5) * slice);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setWinner(null);
    setSpinning(true);
    setRotation(target);
    timer.current = setTimeout(
      () => {
        setSpinning(false);
        setWinner(pick);
      },
      still ? 0 : SPIN_MS,
    );
  }

  const won = winner !== null ? places[winner] : null;

  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-3" data-testid="wheel-panel">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{t("wheel.title")}</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setRound((n) => n + 1)}
          disabled={spinning || state.status === "loading"}
        >
          <Shuffle /> {t("wheel.reshuffle")}
        </Button>
      </div>

      {state.status === "loading" && (
        <p className="flex items-center gap-2 py-6 text-sm text-muted" role="status">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          {t("wheel.loading")}
        </p>
      )}
      {(state.status === "error" || (state.status === "ready" && places.length < 2)) && (
        <p className="py-4 text-sm text-muted">{t("wheel.empty")}</p>
      )}

      {places.length >= 2 && (
        <>
          <div className="relative mx-auto w-full max-w-72">
            <svg viewBox="-100 -100 200 200" className="block w-full" aria-hidden>
              <g
                style={{
                  transform: `rotate(${rotation}deg)`,
                  transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.17, 0.84, 0.3, 1)` : "none",
                }}
              >
                {places.map((place, i) => {
                  const mid = ((i + 0.5) / places.length) * 360 - 90;
                  // labels on the left half would be upside down
                  const flip = mid > 90 && mid < 270;
                  return (
                    <g key={place.id}>
                      <path d={slicePath(i, places.length)} fill={COLORS[i % COLORS.length]} stroke="#fff" strokeWidth="1" />
                      <text
                        transform={`rotate(${mid}) translate(${R - 6} 0)${flip ? " rotate(180)" : ""}`}
                        textAnchor={flip ? "start" : "end"}
                        dominantBaseline="central"
                        fontSize="7.5"
                        fontWeight="600"
                        fill="#fff"
                      >
                        {shorten(place.name)}
                      </text>
                    </g>
                  );
                })}
              </g>
              <circle r="9" fill="#fff" stroke="#26211c" strokeWidth="1.5" />
              <path d="M-7 -100 L7 -100 L0 -84 Z" fill="#26211c" stroke="#fff" strokeWidth="1" />
            </svg>
          </div>

          {won ? (
            <div className="space-y-3 rounded-lg bg-accent-soft p-3" role="status" data-testid="wheel-result">
              <div>
                <p className="text-xs text-accent-strong">{t("wheel.result")}</p>
                <p className="font-medium">{won.name}</p>
                <p className="mt-1 flex items-center gap-2 text-xs text-muted">
                  <Badge className="bg-surface">{t(`category.${won.category}`)}</Badge>
                  {t("events.away", { km: formatKm(haversine(req.start, won), locale) })}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => onAdd(won)} disabled={!canAdd}>
                  <Plus /> {t("wheel.add")}
                </Button>
                <Button variant="outline" onClick={spin}>
                  <RotateCw /> {t("wheel.again")}
                </Button>
              </div>
            </div>
          ) : (
            <Button className="w-full" onClick={spin} disabled={spinning} data-testid="wheel-spin">
              {t("wheel.spin")}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
