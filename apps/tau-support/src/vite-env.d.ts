/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENAI_API_KEY: string;
  /** Dedicated tau-support Supabase project URL (optional; sync skipped if absent). */
  readonly VITE_SUPABASE_URL?: string;
  /** Public anon key for the tau-support Supabase project (optional). */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
