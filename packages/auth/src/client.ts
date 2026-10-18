import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";
import { getPlatformPublicConfig, requirePlatformPublicConfig } from "./env.js";

let browserClient: SupabaseClient | null = null;

export function isPlatformConfigured(): boolean {
  return getPlatformPublicConfig() !== null;
}

export function getPlatformClient(): SupabaseClient {
  if (browserClient) return browserClient;
  const { url, anonKey } = requirePlatformPublicConfig();
  browserClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return browserClient;
}

export async function getPlatformSession(): Promise<Session | null> {
  const { data, error } = await getPlatformClient().auth.getSession();
  if (error) throw error;
  return data.session;
}

/**
 * Returns a session with a usable access_token. Refreshes when missing/near expiry
 * so hub handoff + API Bearer checks do not fail with "Invalid or expired session".
 */
export async function ensureFreshPlatformSession(): Promise<Session | null> {
  const client = getPlatformClient();
  const { data: current, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  const session = current.session;
  if (!session?.refresh_token) return null;

  const expiresAtMs = (session.expires_at ?? 0) * 1000;
  const skewMs = 60_000;
  if (session.access_token && expiresAtMs > Date.now() + skewMs) {
    return session;
  }

  const { data, error } = await client.auth.refreshSession({
    refresh_token: session.refresh_token,
  });
  if (error) throw error;
  return data.session;
}

export async function getPlatformAccessToken(): Promise<string | null> {
  const session = await ensureFreshPlatformSession();
  return session?.access_token ?? null;
}

export async function getPlatformUser(): Promise<User | null> {
  const { data, error } = await getPlatformClient().auth.getUser();
  if (error) return null;
  return data.user;
}

export async function signInWithPassword(
  email: string,
  password: string
): Promise<Session> {
  const { data, error } = await getPlatformClient().auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  if (!data.session) throw new Error("Login succeeded but no session was returned");
  return data.session;
}

export async function signOut(): Promise<void> {
  const { error } = await getPlatformClient().auth.signOut();
  if (error) throw error;
}

export async function setPlatformSession(tokens: {
  access_token: string;
  refresh_token: string;
}): Promise<Session> {
  const { data, error } = await getPlatformClient().auth.setSession({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });
  if (error) throw error;
  if (!data.session) throw new Error("Failed to set session");
  return data.session;
}

export type PlatformGroup = {
  id: string;
  name: string;
  slug: string;
};

export type AccountStatus = "pending" | "approved" | "rejected";

/** Current user's profile status (RLS: own row only). */
export async function getMyAccountStatus(): Promise<AccountStatus> {
  const client = getPlatformClient();
  const {
    data: { user },
    error: userErr,
  } = await client.auth.getUser();
  if (userErr) throw userErr;
  if (!user) throw new Error("Not signed in");

  const { data, error } = await client
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  const status = data?.status;
  if (status === "pending" || status === "rejected" || status === "approved") {
    return status;
  }
  // Legacy users without a status column value — allow access.
  return "approved";
}

export async function updatePlatformPassword(password: string): Promise<void> {
  const { error } = await getPlatformClient().auth.updateUser({ password });
  if (error) throw error;
}

/** Send a password-recovery email; redirect lands on hub /auth/set-password. */
export async function resetPlatformPasswordForEmail(
  email: string,
  redirectTo?: string
): Promise<void> {
  const target =
    redirectTo?.trim() ||
    `${hubOrigin()}/auth/set-password`;
  const { error } = await getPlatformClient().auth.resetPasswordForEmail(
    email.trim(),
    { redirectTo: target }
  );
  if (error) throw error;
}

/**
 * Re-authenticate with email + password (e.g. verify current password before
 * changing it). Throws on wrong credentials.
 */
export async function verifyPlatformPassword(
  email: string,
  password: string
): Promise<Session> {
  return signInWithPassword(email, password);
}

export {
  ADMIN_GROUP_SLUG,
  ADMIN_GROUP_SLUG_LEGACY,
  ADMIN_GROUP_SLUGS,
  PLATFORM_TOOL_IDS,
  isAdminFromGroups,
  isAdminGroupSlug,
  isPlatformToolId,
} from "./constants.js";
export type { PlatformToolId } from "./constants.js";

/** Groups the current user belongs to (RLS: member-only select). */
export async function listUserGroups(): Promise<PlatformGroup[]> {
  const client = getPlatformClient();
  const { data, error } = await client
    .from("groups")
    .select("id, name, slug")
    .order("name");
  if (error) throw error;
  if (!Array.isArray(data)) return [];
  return data.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
  }));
}

/** Distinct tool ids allowed for the current user (union of group_tools). */
export async function listAllowedToolIds(): Promise<string[]> {
  const client = getPlatformClient();
  const { data, error } = await client.rpc("user_allowed_tools");
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

/** Thrown when the user is signed in but their groups do not include `toolId`. */
export class ToolAccessDeniedError extends Error {
  readonly toolId: string;
  constructor(toolId: string) {
    super(`No access to tool: ${toolId}`);
    this.name = "ToolAccessDeniedError";
    this.toolId = toolId;
  }
}

export function isToolAccessDeniedError(
  err: unknown
): err is ToolAccessDeniedError {
  return (
    err instanceof ToolAccessDeniedError ||
    (err instanceof Error &&
      (err.name === "ToolAccessDeniedError" ||
        err.message.startsWith("No access to tool:")))
  );
}

export async function assertToolAccess(toolId: string): Promise<void> {
  // Fail closed on non-approved accounts before checking group entitlements.
  const status = await getMyAccountStatus();
  if (status !== "approved") {
    throw new ToolAccessDeniedError(toolId);
  }

  const { data, error } = await getPlatformClient().rpc("user_has_tool_access", {
    p_tool_id: toolId,
  });
  if (error) throw error;
  if (data !== true) {
    throw new ToolAccessDeniedError(toolId);
  }
}

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const token = await getPlatformAccessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && init.body && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  return fetch(input, { ...init, headers });
}

/** Hub origin from `VITE_HUB_URL`, or local/prod defaults. */
export function hubOrigin(): string {
  const hub =
    (typeof import.meta !== "undefined" &&
      (import.meta as { env?: Record<string, string | undefined> }).env
        ?.VITE_HUB_URL) ||
    (typeof window !== "undefined" && window.location.hostname === "localhost"
      ? "http://localhost:5173"
      : "https://ai-tools-tauonline.vercel.app");
  return hub.replace(/\/$/, "");
}

/** Hub home (catalog). Use when the user is signed in but lacks a tool entitlement. */
export function hubHomeUrl(): string {
  return hubOrigin();
}

/** Hub URL that shows login when unsigned; optional `returnUrl` for post-login resume. */
export function hubLoginUrl(returnUrl?: string): string {
  const origin = hubOrigin();
  if (!returnUrl) return origin;
  const url = new URL(origin);
  url.searchParams.set("returnUrl", returnUrl);
  return url.toString();
}

export async function startToolHandoff(params: {
  toolId: string;
  toolOrigin: string;
  hubHandoffUrl?: string;
}): Promise<string> {
  let session: Session | null;
  try {
    session = await ensureFreshPlatformSession();
  } catch (err) {
    throw new Error(
      err instanceof Error
        ? `Session expired — sign in again (${err.message})`
        : "Session expired — sign in again"
    );
  }
  if (!session?.access_token || !session.refresh_token) {
    throw new Error("Not signed in");
  }
  const callback = new URL("/auth/callback", params.toolOrigin).toString();
  const handoffUrl = params.hubHandoffUrl ?? "/api/auth/handoff";
  const res = await authFetch(handoffUrl, {
    method: "POST",
    body: JSON.stringify({
      toolId: params.toolId,
      redirectUrl: callback,
      refreshToken: session.refresh_token,
    }),
  });
  const body = (await res.json().catch(() => null)) as {
    code?: string;
    error?: string;
  } | null;
  if (!res.ok || !body?.code) {
    throw new Error(body?.error ?? `Handoff failed (${res.status})`);
  }
  const target = new URL("/auth/callback", params.toolOrigin);
  target.searchParams.set("code", body.code);
  return target.toString();
}

export async function exchangeHandoffCode(params: {
  code: string;
  exchangeUrl?: string;
}): Promise<{ access_token: string; refresh_token: string }> {
  const exchangeUrl = params.exchangeUrl ?? "/api/auth/exchange";
  // Exchange may be called on the tool origin; hub exchange lives on hub.
  // Tools call hub's absolute exchange URL via VITE_HUB_URL.
  const res = await fetch(exchangeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: params.code }),
  });
  const body = (await res.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
  } | null;
  if (!res.ok || !body?.access_token || !body?.refresh_token) {
    throw new Error(body?.error ?? `Exchange failed (${res.status})`);
  }
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
  };
}
