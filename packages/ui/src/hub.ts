/** Local platform dev server (Next.js). */
export const HUB_DEV_URL = "http://localhost:3000";

/**
 * Production hub URL on Vercel.
 * Override with `VITE_HUB_URL` in legacy Vite apps (removed) if needed.
 */
export const HUB_PROD_URL = "https://ai-tools-tauonline.vercel.app";

/** DEV → localhost platform; production → live hub URL; Next.js platform → "/". */
export function hubHref(): string {
  // Next.js platform tools pass hubUrl="/" explicitly. This default covers
  // any PageLayout usage that doesn't override hubUrl.
  const env = (import.meta as { env?: { DEV?: boolean; VITE_HUB_URL?: string } }).env;
  if (!env) return "/";
  if (env.DEV) return HUB_DEV_URL;
  const fromEnv = env.VITE_HUB_URL;
  return typeof fromEnv === "string" && fromEnv.length > 0 ? fromEnv : HUB_PROD_URL;
}
