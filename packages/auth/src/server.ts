import { createClient, type User } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { ADMIN_GROUP_SLUG } from "./constants";
import {
  getPlatformPublicConfig,
  getPlatformServiceRoleKey,
  requirePlatformPublicConfig,
} from "./envServer";

export {
  ADMIN_GROUP_SLUG,
  PLATFORM_TOOL_IDS,
  isPlatformToolId,
  type PlatformToolId,
} from "./constants";

function getServerEnv(): Record<string, string | undefined> {
  return (
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env ?? {}
  );
}

export function createPlatformAnonServerClient() {
  const url =
    getServerEnv().PLATFORM_SUPABASE_URL?.trim() ||
    getPlatformPublicConfig()?.url;
  const anonKey =
    getServerEnv().PLATFORM_SUPABASE_ANON_KEY?.trim() ||
    getPlatformPublicConfig()?.anonKey;
  if (!url || !anonKey) {
    throw new Error(
      "Missing PLATFORM_SUPABASE_URL / PLATFORM_SUPABASE_ANON_KEY on server"
    );
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createPlatformServiceClient() {
  const url =
    getServerEnv().PLATFORM_SUPABASE_URL?.trim() ||
    requirePlatformPublicConfig().url;
  const serviceKey = getPlatformServiceRoleKey();
  if (!serviceKey) {
    throw new Error(
      "Missing PLATFORM_SUPABASE_SERVICE_ROLE_KEY (Course-Builder service_role) on server"
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function extractBearerToken(
  authorizationHeader: string | string | null | undefined
): string | null {
  if (!authorizationHeader || typeof authorizationHeader !== "string") {
    return null;
  }
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export type VerifiedPlatformUser = {
  user: User;
  accessToken: string;
};

export async function verifyPlatformAccessToken(
  accessToken: string
): Promise<VerifiedPlatformUser> {
  const client = createPlatformAnonServerClient();
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) {
    const detail = error?.message?.trim() || "";
    const lower = detail.toLowerCase();
    if (
      lower.includes("fetch failed") ||
      lower.includes("certificate") ||
      lower.includes("self-signed")
    ) {
      throw new AuthError(
        "Cannot reach Platform Auth from the local server (TLS/proxy). On Windows corporate networks, ensure win-ca is installed or set NODE_EXTRA_CA_CERTS to your company CA.",
        503
      );
    }
    throw new AuthError(
      detail && lower !== "invalid or expired session"
        ? `Invalid or expired session (${detail})`
        : "Invalid or expired session",
      401
    );
  }
  return { user: data.user, accessToken };
}

export async function verifyPlatformRequest(
  req: { headers?: { authorization?: string | string[] | undefined } } | Request
): Promise<VerifiedPlatformUser> {
  let authorization: string | null = null;
  if (typeof Request !== "undefined" && req instanceof Request) {
    authorization = req.headers.get("authorization");
  } else {
    const raw = (req as { headers?: { authorization?: string | string[] } })
      .headers?.authorization;
    authorization = Array.isArray(raw) ? raw[0] ?? null : raw ?? null;
  }
  const token = extractBearerToken(authorization);
  if (!token) throw new AuthError("Missing Authorization bearer token", 401);
  return verifyPlatformAccessToken(token);
}

export async function listAllowedToolIdsForUser(
  userId: string
): Promise<string[]> {
  const admin = createPlatformServiceClient();
  const { data, error } = await admin.rpc("user_allowed_tools", {
    p_user_id: userId,
  });
  if (error) throw error;
  if (!Array.isArray(data)) return [];
  return data
    .map((row) =>
      typeof row === "string"
        ? row
        : row && typeof row === "object" && "tool_id" in row
          ? String((row as { tool_id: unknown }).tool_id)
          : null
    )
    .filter((id): id is string => Boolean(id));
}

export async function assertUserHasToolAccess(
  userId: string,
  toolId: string
): Promise<void> {
  const admin = createPlatformServiceClient();
  const { data, error } = await admin.rpc("user_has_tool_access", {
    p_tool_id: toolId,
    p_user_id: userId,
  });
  if (error) throw error;
  if (data !== true) {
    throw new AuthError(`No access to tool: ${toolId}`, 403);
  }
}

export async function assertUserIsApproved(userId: string): Promise<void> {
  const admin = createPlatformServiceClient();
  const { data, error } = await admin
    .from("profiles")
    .select("status")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  const status = data?.status;
  if (status === "pending") {
    throw new AuthError("Account pending admin approval", 403);
  }
  if (status === "rejected") {
    throw new AuthError("Account was rejected", 403);
  }
}

export async function assertUserIsAdmin(userId: string): Promise<void> {
  const admin = createPlatformServiceClient();
  const { data, error } = await admin
    .from("group_members")
    .select("group_id, groups!inner(slug)")
    .eq("user_id", userId)
    .eq("groups.slug", ADMIN_GROUP_SLUG)
    .limit(1);
  if (error) throw error;
  if (!data?.length) {
    throw new AuthError("Admin access required", 403);
  }
}

export async function requireToolAccessFromRequest(
  req: { headers?: { authorization?: string | string[] | undefined } } | Request,
  toolId: string
): Promise<VerifiedPlatformUser> {
  const verified = await verifyPlatformRequest(req);
  await assertUserIsApproved(verified.user.id);
  await assertUserHasToolAccess(verified.user.id, toolId);
  return verified;
}

type ApiRequest = {
  headers?: { authorization?: string | string[] | undefined };
};

type ApiResponse = {
  status: (code: number) => { json: (body: unknown) => unknown };
};

/**
 * Wrap a Vercel Node handler so it only runs for an approved Platform user
 * (and, with `toolId`, one who has access to that tool). Auth failures become
 * `{ error }` JSON with the AuthError status; anything else is 401.
 *
 * Accepts a `{ default: fn }` module object too: Node ESM can hand that shape
 * to `"type": "module"` apps importing a CJS default export.
 */
export function withPlatformAuth<Req extends ApiRequest, Res extends ApiResponse>(
  handler: (req: Req, res: Res) => unknown,
  options: { toolId?: string } = {}
): (req: Req, res: Res) => Promise<unknown> {
  const run = resolveHandlerFunction<Req, Res>(handler);
  return async (req, res) => {
    try {
      if (options.toolId) {
        await requireToolAccessFromRequest(req, options.toolId);
      } else {
        const verified = await verifyPlatformRequest(req);
        await assertUserIsApproved(verified.user.id);
      }
    } catch (err: unknown) {
      if (err instanceof AuthError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      if (!run) throw new Error("API handler is not a function (stale build output?)");
      return await run(req, res);
    } catch (err: unknown) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : "Handler failed",
      });
    }
  };
}

function resolveHandlerFunction<Req, Res>(
  mod: unknown
): ((req: Req, res: Res) => unknown) | null {
  if (typeof mod === "function") return mod as (req: Req, res: Res) => unknown;
  const inner = (mod as { default?: unknown } | null)?.default;
  return typeof inner === "function"
    ? (inner as (req: Req, res: Res) => unknown)
    : null;
}

const HANDOFF_TTL_MS = 2 * 60 * 1000;

export async function createHandoffCode(params: {
  userId: string;
  toolId: string;
  redirectUrl: string;
  accessToken: string;
  refreshToken: string;
}): Promise<string> {
  await assertUserIsApproved(params.userId);
  await assertUserHasToolAccess(params.userId, params.toolId);
  const code = randomBytes(24).toString("hex");
  const admin = createPlatformServiceClient();
  const { error } = await admin.from("auth_handoff_codes").insert({
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
  userId: string;
}> {
  const admin = createPlatformServiceClient();
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

  // Idempotent within TTL: React StrictMode (and retries) may redeem twice.
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
    userId: row.user_id as string,
  };
}

export class AuthError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}
