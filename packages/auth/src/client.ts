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

export async function assertToolAccess(toolId: string): Promise<void> {
  const { data, error } = await getPlatformClient().rpc("user_has_tool_access", {
    p_tool_id: toolId,
  });
  if (error) throw error;
  if (data !== true) {
    throw new Error(`No access to tool: ${toolId}`);
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

export function hubLoginUrl(returnUrl?: string): string {
  const hub =
    (typeof import.meta !== "undefined" &&
      (import.meta as { env?: Record<string, string | undefined> }).env
        ?.VITE_HUB_URL) ||
    (typeof window !== "undefined" && window.location.hostname === "localhost"
      ? "http://localhost:5173"
      : "https://ai-tools-tauonline.vercel.app");
  const origin = hub.replace(/\/$/, "");
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
