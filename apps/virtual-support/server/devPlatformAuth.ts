/**
 * Dev-only Platform JWT gate for Vite middleware.
 * Kept local (not @workspace/auth) so vite.config can load under Node ESM.
 */

import { createClient } from "@supabase/supabase-js";

export class DevAuthError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = "DevAuthError";
    this.statusCode = statusCode;
  }
}

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

const TOOL_ID = "virtual-support";
/** Mirrors ADMIN_GROUP_SLUG in @workspace/auth (not imported; see header). */
const ADMIN_GROUP_SLUG = "admin-all-tools";

export async function requireVsPlatformAuth(
  authorizationHeader: string | undefined,
  options: { requireAdmin?: boolean } = {}
): Promise<void> {
  const token = authorizationHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) {
    throw new DevAuthError("Missing Authorization bearer token", 401);
  }

  const url =
    env("PLATFORM_SUPABASE_URL") ||
    env("VITE_PLATFORM_SUPABASE_URL") ||
    env("VITE_SUPABASE_URL");
  const anonKey =
    env("PLATFORM_SUPABASE_ANON_KEY") ||
    env("VITE_PLATFORM_SUPABASE_ANON_KEY");
  const serviceKey = env("PLATFORM_SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !anonKey) {
    throw new DevAuthError(
      "Platform Supabase URL/anon key not configured on the server",
      500
    );
  }

  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data.user) {
    throw new DevAuthError("Invalid or expired session", 401);
  }

  if (!serviceKey) {
    throw new DevAuthError(
      "Missing PLATFORM_SUPABASE_SERVICE_ROLE_KEY on the server",
      500
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("status")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileErr) {
    throw new DevAuthError(profileErr.message, 500);
  }
  if (profile?.status === "pending") {
    throw new DevAuthError("Account pending admin approval", 403);
  }
  if (profile?.status === "rejected") {
    throw new DevAuthError("Account was rejected", 403);
  }

  const { data: allowed, error: accessErr } = await admin.rpc(
    "user_has_tool_access",
    {
      p_tool_id: TOOL_ID,
      p_user_id: data.user.id,
    }
  );
  if (accessErr) {
    throw new DevAuthError(accessErr.message, 500);
  }
  if (allowed !== true) {
    throw new DevAuthError(`No access to tool: ${TOOL_ID}`, 403);
  }

  if (options.requireAdmin) {
    // Same rule as assertUserIsAdmin in @workspace/auth/server (canonical slug).
    const { data: adminRows, error: adminErr } = await admin
      .from("group_members")
      .select("group_id, groups!inner(slug)")
      .eq("user_id", data.user.id)
      .eq("groups.slug", ADMIN_GROUP_SLUG)
      .limit(1);
    if (adminErr) {
      throw new DevAuthError(adminErr.message, 500);
    }
    if (!adminRows?.length) {
      throw new DevAuthError("Admin access required", 403);
    }
  }
}
