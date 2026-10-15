import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

/** Server-only Tau-Support client (service_role). Never ship this key to the browser. */
export function createTauServiceClient(): SupabaseClient {
  const url =
    env("TAU_SUPABASE_URL") ||
    env("SUPABASE_URL") ||
    env("VITE_SUPABASE_URL");
  const key =
    env("TAU_SUPABASE_SERVICE_ROLE_KEY") ||
    env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    const missing = [
      !url && "TAU_SUPABASE_URL (or VITE_SUPABASE_URL)",
      !key && "TAU_SUPABASE_SERVICE_ROLE_KEY",
    ].filter(Boolean);
    throw new Error(`Missing on server: ${missing.join(", ")}`);
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
