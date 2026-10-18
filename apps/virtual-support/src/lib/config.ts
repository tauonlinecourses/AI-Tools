/** True when the data project URL is set (BFF still needs service_role on server). */
export const isDataConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL?.trim()
);
