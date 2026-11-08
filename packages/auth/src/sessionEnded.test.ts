import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  expiresAt: 0,
  refreshError: null as unknown,
  signOut: vi.fn(async () => ({ error: null })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({
        data: {
          session: {
            access_token: "token",
            refresh_token: "refresh",
            expires_at: auth.expiresAt,
          },
        },
        error: null,
      }),
      refreshSession: async () => ({
        data: { session: auth.refreshError ? null : { access_token: "new" } },
        error: auth.refreshError,
      }),
      signOut: auth.signOut,
    },
  }),
}));

const {
  authFetch,
  clearLocalPlatformSession,
  isEndedSessionHandoffError,
  setPlatformSessionEndedListener,
} = await import("./client");

const listener = vi.fn();
const respondWith = (status: number, body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status }))
  );

beforeAll(() => {
  process.env.PLATFORM_SUPABASE_URL = "https://example.supabase.co";
  process.env.PLATFORM_SUPABASE_ANON_KEY = "anon";
});

beforeEach(() => {
  auth.expiresAt = Math.floor(Date.now() / 1000) + 3600;
  auth.refreshError = null;
  auth.signOut.mockClear();
  listener.mockClear();
  setPlatformSessionEndedListener(listener);
});

afterEach(() => {
  setPlatformSessionEndedListener(null);
  vi.unstubAllGlobals();
});

describe("ended session detection", () => {
  it("reports the server's ended-session 401 and keeps the body readable", async () => {
    const error = "Invalid or expired session (Auth session missing!)";
    respondWith(401, { error });
    const res = await authFetch("/api/admin");
    expect(listener).toHaveBeenCalledOnce();
    await expect(res.json()).resolves.toEqual({ error });
  });

  it.each([
    [401, { error: "Missing Authorization bearer token" }],
    [403, { error: "No access to tool: hub" }],
    [500, { error: "Invalid or expired session" }],
    [200, { ok: true }],
  ])("ignores status %s with %j", async (status, body) => {
    respondWith(status, body);
    await authFetch("/api/admin");
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not fail on a non-JSON 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    await expect(authFetch("/api/admin")).resolves.toBeInstanceOf(Response);
    expect(listener).not.toHaveBeenCalled();
  });

  it("does nothing extra without a listener, as in standalone tools", async () => {
    setPlatformSessionEndedListener(null);
    respondWith(401, { error: "Invalid or expired session" });
    await expect(authFetch("/api/chat")).resolves.toBeInstanceOf(Response);
  });

  it.each([
    [{ code: "refresh_token_not_found", message: "x" }],
    [{ message: "Invalid Refresh Token: Already Used" }],
    [{ name: "AuthSessionMissingError", message: "Auth session missing!" }],
  ])("reports a dead refresh token: %j", async (error) => {
    auth.expiresAt = 0;
    auth.refreshError = error;
    await expect(authFetch("/api/admin")).rejects.toBe(error);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("does not report a network failure during refresh", async () => {
    auth.expiresAt = 0;
    auth.refreshError = new Error("Failed to fetch");
    await expect(authFetch("/api/admin")).rejects.toThrow("Failed to fetch");
    expect(listener).not.toHaveBeenCalled();
  });

  describe("when requests are held, as in standalone tools", () => {
    const stillPending = (request: Promise<unknown>) =>
      Promise.race([
        request.then(() => false, () => false),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 20)),
      ]);

    beforeEach(() => {
      setPlatformSessionEndedListener(listener, { holdRequests: true });
    });

    it("never settles an ended-session response", async () => {
      respondWith(401, { error: "Invalid or expired session (Auth session missing!)" });
      await expect(stillPending(authFetch("/api/data"))).resolves.toBe(true);
      expect(listener).toHaveBeenCalledOnce();
    });

    it("never settles a dead refresh token", async () => {
      auth.expiresAt = 0;
      auth.refreshError = { code: "refresh_token_not_found" };
      await expect(stillPending(authFetch("/api/data"))).resolves.toBe(true);
    });

    it("still returns ordinary failures", async () => {
      respondWith(500, { error: "Server error" });
      await expect(stillPending(authFetch("/api/data"))).resolves.toBe(false);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  it("recognizes handoff failures caused by an ended login", () => {
    expect(
      isEndedSessionHandoffError(new Error("Invalid or expired session (Auth session missing!)"))
    ).toBe(true);
    expect(isEndedSessionHandoffError(new Error("Session expired — sign in again"))).toBe(true);
    expect(isEndedSessionHandoffError(new Error("No access to tool: x"))).toBe(false);
    expect(isEndedSessionHandoffError(null)).toBe(false);
  });

  it("clears only this browser's copy", async () => {
    await clearLocalPlatformSession();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
