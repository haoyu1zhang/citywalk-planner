import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { LOCALE_TAG, type Locale } from "@/lib/i18n";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "850 m" / "4.5 km", with the decimal separator of the visitor's language. */
export function formatKm(meters: number, locale: Locale = "en"): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = new Intl.NumberFormat(LOCALE_TAG[locale], { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${km.format(meters / 1000)} km`;
}
