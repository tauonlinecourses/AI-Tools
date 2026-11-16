/**
 * Origins allowed to call hub APIs cross-origin (only `/api/auth-exchange`:
 * standalone tools redeem their handoff code there). Every other hub API is
 * same-origin and sends no CORS headers.
 *
 * Keep in sync with the production `url`s in `src/tools.config.ts`; a test
 * fails if they drift.
 */
export const TOOL_ORIGINS: readonly string[] = [
  "https://ai-tools-video-curator.vercel.app",
  "https://ai-tools-course-builder.vercel.app",
  "https://ai-tools-tau-support.vercel.app",
  "https://ai-tools-virtual-support.vercel.app",
];

const LOCAL_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

/**
 * Returns the origin to echo in Access-Control-Allow-Origin, or null to send
 * none (the browser then blocks the response). Localhost is allowed outside
 * Vercel production, for `pnpm dev`.
 */
export function allowedCorsOrigin(
  origin: string | undefined,
  vercelEnv: string | undefined
): string | null {
  if (!origin) return null;
  if (TOOL_ORIGINS.includes(origin)) return origin;
  if (vercelEnv !== "production" && LOCAL_ORIGIN_RE.test(origin)) return origin;
  return null;
}
