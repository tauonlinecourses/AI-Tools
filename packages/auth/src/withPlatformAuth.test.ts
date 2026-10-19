import { beforeAll, describe, expect, it, vi } from "vitest";

const PROFILE_STATUS: Record<string, string> = { "user-pending": "pending" };
const TOOL_ACCESS = new Set(["user-ok:tau-support"]);

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: async (token: string) =>
        token.startsWith("good-")
          ? { data: { user: { id: token.slice(5) } }, error: null }
          : { data: { user: null }, error: { message: "invalid JWT" } },
    },
    from: () => {
      let userId = "";
      const query = {
        select: () => query,
        eq: (_column: string, value: string) => {
          userId = value;
          return query;
        },
        maybeSingle: async () => ({
          data: { status: PROFILE_STATUS[userId] ?? "approved" },
          error: null,
        }),
      };
      return query;
    },
    rpc: async (_fn: string, args: { p_tool_id: string; p_user_id: string }) => ({
      data: TOOL_ACCESS.has(`${args.p_user_id}:${args.p_tool_id}`),
      error: null,
    }),
  }),
}));

const { withPlatformAuth } = await import("./server");

function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

function reqWith(token?: string) {
  return { headers: token ? { authorization: `Bearer ${token}` } : {} };
}

beforeAll(() => {
  process.env.PLATFORM_SUPABASE_URL = "https://example.supabase.co";
  process.env.PLATFORM_SUPABASE_ANON_KEY = "anon";
  process.env.PLATFORM_SUPABASE_SERVICE_ROLE_KEY = "service";
});

describe("withPlatformAuth", () => {
  const ok = (_req: unknown, res: ReturnType<typeof mockRes>) =>
    res.status(200).json({ ok: true });

  it("rejects a missing bearer token with 401", async () => {
    const res = mockRes();
    await withPlatformAuth(ok)(reqWith(), res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Missing Authorization bearer token" });
  });

  it("rejects an invalid session with 401 and keeps the detail", async () => {
    const res = mockRes();
    await withPlatformAuth(ok)(reqWith("bad"), res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Invalid or expired session (invalid JWT)" });
  });

  it("rejects pending accounts with 403", async () => {
    const res = mockRes();
    await withPlatformAuth(ok)(reqWith("good-user-pending"), res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "Account pending admin approval" });
  });

  it("runs the handler for approved users when no tool is required", async () => {
    const res = mockRes();
    await withPlatformAuth(ok)(reqWith("good-user-other"), res);
    expect(res.statusCode).toBe(200);
  });

  it("enforces tool access when toolId is set", async () => {
    const denied = mockRes();
    await withPlatformAuth(ok, { toolId: "tau-support" })(reqWith("good-user-other"), denied);
    expect(denied.statusCode).toBe(403);
    expect(denied.body).toEqual({ error: "No access to tool: tau-support" });

    const allowed = mockRes();
    await withPlatformAuth(ok, { toolId: "tau-support" })(reqWith("good-user-ok"), allowed);
    expect(allowed.statusCode).toBe(200);
  });

  it("unwraps a { default: fn } module object", async () => {
    const res = mockRes();
    const mod = { default: ok } as unknown as typeof ok;
    await withPlatformAuth(mod)(reqWith("good-user-other"), res);
    expect(res.statusCode).toBe(200);
  });

  it("returns 500 when the handler throws or is not a function", async () => {
    const thrown = mockRes();
    await withPlatformAuth(() => {
      throw new Error("boom");
    })(reqWith("good-user-other"), thrown);
    expect(thrown.statusCode).toBe(500);
    expect(thrown.body).toEqual({ error: "boom" });

    const missing = mockRes();
    await withPlatformAuth({} as unknown as typeof ok)(reqWith("good-user-other"), missing);
    expect(missing.statusCode).toBe(500);
  });
});
