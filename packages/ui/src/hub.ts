/** Local hub (apps/hub Vite port). */
export const HUB_DEV_URL = "http://localhost:5173";

/**
 * Live hub on Vercel: https://ai-tools-tauonline.vercel.app/
 * Override per app with `VITE_HUB_URL` if needed.
 */
export const HUB_PROD_URL = "https://ai-tools-tauonline.vercel.app";

/** DEV → localhost hub; production/Vercel build → live hub URL. */
export function hubHref(): string {
  // Env-safe: `import.meta.env` only exists under Vite. In the Next.js
  // platform the hub is the root route, so pages there pass hubUrl="/".
  const env = (import.meta as { env?: { DEV?: boolean; VITE_HUB_URL?: string } }).env;
  if (env?.DEV) return HUB_DEV_URL;
  const fromEnv = env?.VITE_HUB_URL;
  return typeof fromEnv === "string" && fromEnv.length > 0 ? fromEnv : HUB_PROD_URL;
}
