/** Local hub (apps/hub Vite port). */
export const HUB_DEV_URL = "http://localhost:5173";

/**
 * Live hub on Vercel: https://ai-tools-tauonline.vercel.app/
 * Override per app with `VITE_HUB_URL` if needed.
 */
export const HUB_PROD_URL = "https://ai-tools-tauonline.vercel.app";

export type HubLocale = "en" | "he";

export const HUB_LOCALE_STORAGE_KEY = "ai-tools-hub-locale";

/** DEV → localhost hub; production/Vercel build → live hub URL (no path). */
export function hubOrigin(): string {
  if (import.meta.env.DEV) return HUB_DEV_URL;
  const fromEnv = import.meta.env.VITE_HUB_URL;
  return typeof fromEnv === "string" && fromEnv.length > 0 ? fromEnv : HUB_PROD_URL;
}

/**
 * Hub home URL. Hebrew (default) is `/`; English is `/en`.
 * `VITE_HUB_URL` may include a trailing slash; path is normalized.
 */
export function hubHref(locale: HubLocale = "he"): string {
  const origin = hubOrigin().replace(/\/$/, "");
  return locale === "en" ? `${origin}/en` : origin;
}

/** Read `?lang=` then localStorage; default `"he"`. */
export function resolveHubLocale(): HubLocale {
  if (typeof window === "undefined") return "he";
  const fromQuery = new URLSearchParams(window.location.search).get("lang");
  if (fromQuery === "he" || fromQuery === "en") return fromQuery;
  const stored = window.localStorage.getItem(HUB_LOCALE_STORAGE_KEY);
  if (stored === "he" || stored === "en") return stored;
  return "he";
}

export function persistHubLocale(locale: HubLocale): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HUB_LOCALE_STORAGE_KEY, locale);
}
