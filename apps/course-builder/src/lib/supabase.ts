/**
 * Course-Builder data + Platform Auth share this project.
 * Use the shared Platform client so hub handoff sessions apply to RLS.
 */

import { getPlatformClient, isPlatformConfigured } from "@workspace/auth/client";

if (!isPlatformConfigured()) {
  throw new Error(
    "Missing VITE_PLATFORM_SUPABASE_URL / VITE_PLATFORM_SUPABASE_ANON_KEY " +
      "(or VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) — set them in apps/course-builder/.env " +
      "to the Course-Builder project and restart the dev server."
  );
}

export const supabase = getPlatformClient();
