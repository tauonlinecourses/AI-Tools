/**
 * Copies Vite `loadEnv` values into `process.env` so `api/*.ts` handlers see
 * the same variables locally that Vercel injects in production.
 *
 * Each entry is `[target, source]`: `process.env[target]` is set from
 * `env[source]` only when the target is still empty, so earlier entries win.
 */
export type EnvBridge = ReadonlyArray<readonly [target: string, source: string]>;

/** Entries that copy each key onto itself. */
export function same(...keys: string[]): EnvBridge {
  return keys.map((key) => [key, key] as const);
}

/** Platform Supabase (auth gate) + OpenAI (shared `/api/chat`). */
export const PLATFORM_ENV: EnvBridge = [
  ...same(
    "PLATFORM_SUPABASE_URL",
    "PLATFORM_SUPABASE_ANON_KEY",
    "PLATFORM_SUPABASE_SERVICE_ROLE_KEY",
  ),
  ["PLATFORM_SUPABASE_URL", "VITE_PLATFORM_SUPABASE_URL"],
  ["PLATFORM_SUPABASE_ANON_KEY", "VITE_PLATFORM_SUPABASE_ANON_KEY"],
  ...same("OPENAI_API_KEY"),
];

export function bridgeEnv(
  env: Record<string, string | undefined>,
  bridge: EnvBridge,
  target: Record<string, string | undefined> = process.env,
): void {
  for (const [to, from] of bridge) {
    const value = env[from];
    if (value) target[to] ||= value;
  }
}
