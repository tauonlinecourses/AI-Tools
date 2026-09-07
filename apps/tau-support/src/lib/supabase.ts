/**
 * Supabase client for the dedicated tau-support project.
 *
 * When configured, Supabase is the durable inbox source of truth (hydrate on
 * load + sync after each poll). localStorage is a write-through cache for
 * instant paint and offline fallback. If env vars are missing, the app still
 * runs on localStorage alone and sync/hydrate are skipped.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  console.warn(
    "[tau-support] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — " +
      "inbox hydrate/sync skipped. Falling back to localStorage only."
  );
}

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!)
  : null;
