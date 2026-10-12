/**
 * Tau-Support data client.
 *
 * Browser: must not use the Tau anon key for data (RLS denies anon).
 * All browser data access goes through /api/tau-data with a Platform JWT.
 * Server (BFF): bind the service_role client via bindTauSupabase().
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const g = globalThis as typeof globalThis & {
  __tauSupabase?: SupabaseClient | null;
};

function readEnv(name: string): string | undefined {
  if (typeof import.meta !== "undefined") {
    const v = (import.meta as { env?: Record<string, string | undefined> }).env?.[
      name
    ]?.trim();
    if (v) return v;
  }
  return (
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env?.[name]?.trim() || undefined
  );
}

const url = readEnv("VITE_SUPABASE_URL") || readEnv("TAU_SUPABASE_URL");
const anonKey =
  readEnv("VITE_SUPABASE_ANON_KEY") || readEnv("TAU_SUPABASE_ANON_KEY");

/** True when the Tau project URL is configured (BFF can talk to it). */
export const isSupabaseConfigured = Boolean(
  url &&
    (anonKey ||
      readEnv("TAU_SUPABASE_SERVICE_ROLE_KEY") ||
      readEnv("SUPABASE_SERVICE_ROLE_KEY"))
);

if (typeof window !== "undefined" && !url) {
  console.warn(
    "[tau-support] VITE_SUPABASE_URL not set — inbox hydrate/sync skipped."
  );
}

export function bindTauSupabase(client: SupabaseClient | null): void {
  g.__tauSupabase = client;
}

export function getTauSupabase(): SupabaseClient {
  if (g.__tauSupabase) return g.__tauSupabase;
  throw new Error(
    "Tau Supabase client is not available in the browser. Use /api/tau-data."
  );
}

/**
 * Compatibility export for server-bound modules. In the browser this throws
 * if used directly — call sites must use the BFF on the client path.
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getTauSupabase();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export function createBrowserAnonClient(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  return createClient(url, anonKey);
}
