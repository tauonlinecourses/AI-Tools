/**
 * Hub serverless Platform Auth helpers.
 * Kept local (not @workspace/auth/server) so Vercel Node can bundle this
 * file with @supabase/supabase-js without crashing on workspace TS exports.
 */
import { createClient, type User } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

export class AuthError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function platformUrl(): string {
  const url = env("PLATFORM_SUPABASE_URL") || env("VITE_PLATFORM_SUPABASE_URL");
  if (!url) {
    throw new Error("Missing PLATFORM_SUPABASE_URL on hub server");
  }
  return url;
}

function platformAnon(): string {
  const key =
    env("PLATFORM_SUPABASE_ANON_KEY") || env("VITE_PLATFORM_SUPABASE_ANON_KEY");
  if (!key) {
    throw new Error("Missing PLATFORM_SUPABASE_ANON_KEY on hub server");
  }
  return key;
}

function platformServiceRole(): string {
  const key =
    env("PLATFORM_SUPABASE_SERVICE_ROLE_KEY") ||
    env("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) {
    throw new Error(
      "Missing PLATFORM_SUPABASE_SERVICE_ROLE_KEY on hub server"
    );
  }
  return key;
}

function anonClient() {
  return createClient(platformUrl(), platformAnon(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function serviceClient() {
  return createClient(platformUrl(), platformServiceRole(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type VerifiedPlatformUser = {
  user: User;
  accessToken: string;
};

export async function verifyPlatformRequest(req: {
  headers?: { authorization?: string | string[] };
}): Promise<VerifiedPlatformUser> {
  const raw = req.headers?.authorization;
  const header = Array.isArray(raw) ? raw[0] : raw;
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) throw new AuthError("Missing Authorization bearer token", 401);

  const { data, error } = await anonClient().auth.getUser(token);
  if (error || !data.user) {
    throw new AuthError(
      error?.message
        ? `Invalid or expired session (${error.message})`
        : "Invalid or expired session",
      401
    );
  }
  return { user: data.user, accessToken: token };
}

async function assertToolAccess(userId: string, toolId: string): Promise<void> {
  const { data, error } = await serviceClient().rpc("user_has_tool_access", {
    p_tool_id: toolId,
    p_user_id: userId,
  });
  if (error) throw error;
  if (data !== true) throw new AuthError(`No access to tool: ${toolId}`, 403);
}

const HANDOFF_TTL_MS = 2 * 60 * 1000;

export async function createHandoffCode(params: {
  userId: string;
  toolId: string;
  redirectUrl: string;
  accessToken: string;
  refreshToken: string;
}): Promise<string> {
  await assertToolAccess(params.userId, params.toolId);
  const code = randomBytes(24).toString("hex");
  const { error } = await serviceClient().from("auth_handoff_codes").insert({
    code,
    user_id: params.userId,
    tool_id: params.toolId,
    redirect_url: params.redirectUrl,
    access_token: params.accessToken,
    refresh_token: params.refreshToken,
    expires_at: new Date(Date.now() + HANDOFF_TTL_MS).toISOString(),
  });
  if (error) throw error;
  return code;
}

export async function redeemHandoffCode(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  toolId: string;
}> {
  const admin = serviceClient();
  const { data: row, error } = await admin
    .from("auth_handoff_codes")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new AuthError("Invalid handoff code", 400);
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new AuthError("Handoff code expired", 400);
  }
  if (!row.used_at) {
    const { error: useErr } = await admin
      .from("auth_handoff_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("code", code)
      .is("used_at", null);
    if (useErr) throw useErr;
  }
  return {
    access_token: row.access_token as string,
    refresh_token: row.refresh_token as string,
    toolId: row.tool_id as string,
  };
}
