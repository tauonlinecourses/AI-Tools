/**
 * Supabase client for the dedicated tau-support project.
 *
 * Unlike course-builder, this client is OPTIONAL: if the env vars are missing
 * the app still runs (the browser localStorage inbox remains the source of
 * truth) and thread → Supabase sync is simply skipped. This keeps the forum
 * poller working even before the Supabase project is provisioned.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  console.warn(
    "[tau-support] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — " +
      "thread sync to Supabase is skipped. The localStorage inbox still works."
  );
}

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!)
  : null;
