import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeAccountStatus } from "./constants";
import { createMembershipTracker } from "./membershipTracker";

const state = vi.hoisted(() => ({
  profile: null as { status: unknown } | null,
  codes: [] as Record<string, unknown>[],
  purgeFails: false,
  purgedBefore: [] as string[],
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: async () => ({ data: true, error: null }),
    from: (table: string) => {
      if (table === "profiles") {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: async () => ({ data: state.profile, error: null }),
        };
        return query;
      }
      let code = "";
      const query = {
        select: () => query,
        eq: (_column: string, value: string) => {
          code = value;
          return query;
        },
        is: async () => ({ error: null }),
        update: () => query,
        maybeSingle: async () => ({
          data: state.codes.find((row) => row.code === code) ?? null,
          error: null,
        }),
        insert: async (row: Record<string, unknown>) => {
          state.codes.push(row);
          return { error: null };
        },
        delete: () => ({
          lt: async (_column: string, value: string) => {
            state.purgedBefore.push(value);
            return { error: state.purgeFails ? { message: "purge failed" } : null };
          },
        }),
      };
      return query;
    },
  }),
}));

const { assertUserIsApproved, createHandoffCode, redeemHandoffCode } = await import("./server");
const { isInvalidCredentialsError } = await import("./client");

const mint = () =>
  createHandoffCode({
    userId: "u1",
    toolId: "tau-support",
    redirectUrl: "https://tool.example.test",
    accessToken: "access",
    refreshToken: "refresh",
  });

beforeAll(() => {
  process.env.PLATFORM_SUPABASE_URL = "https://example.supabase.co";
  process.env.PLATFORM_SUPABASE_ANON_KEY = "anon";
  process.env.PLATFORM_SUPABASE_SERVICE_ROLE_KEY = "service";
});

beforeEach(() => {
  state.profile = null;
  state.codes = [];
  state.purgeFails = false;
  state.purgedBefore = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("normalizeAccountStatus", () => {
  it("keeps real statuses", () => {
    expect(normalizeAccountStatus("approved")).toBe("approved");
    expect(normalizeAccountStatus("rejected")).toBe("rejected");
    expect(normalizeAccountStatus("pending")).toBe("pending");
  });

  it.each([null, undefined, "", "banned", 1])("treats %s as pending", (value) => {
    expect(normalizeAccountStatus(value)).toBe("pending");
  });
});

describe("assertUserIsApproved", () => {
  it("allows an approved user", async () => {
    state.profile = { status: "approved" };
    await expect(assertUserIsApproved("u1")).resolves.toBeUndefined();
  });

  it.each([
    ["pending", { status: "pending" }],
    ["rejected", { status: "rejected" }],
    ["null status", { status: null }],
    ["missing profile", null],
  ])("blocks %s with 403", async (_name, profile) => {
    state.profile = profile;
    await expect(assertUserIsApproved("u1")).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("handoff codes", () => {
  it("removes expired rows when minting", async () => {
    await mint();
    expect(state.purgedBefore).toHaveLength(1);
    expect(state.codes).toHaveLength(1);
  });

  it("still mints when cleanup fails", async () => {
    state.purgeFails = true;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(mint()).resolves.toEqual(expect.any(String));
    expect(state.codes).toHaveLength(1);
  });

  it("can be redeemed twice within the TTL", async () => {
    const code = await mint();
    await expect(redeemHandoffCode(code)).resolves.toMatchObject({ access_token: "access" });
    await expect(redeemHandoffCode(code)).resolves.toMatchObject({ access_token: "access" });
  });

  it("cannot be redeemed after the TTL", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-08T10:00:00Z") });
    const code = await mint();
    vi.setSystemTime(new Date("2026-11-08T10:02:01Z"));
    await expect(redeemHandoffCode(code)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("isInvalidCredentialsError", () => {
  it("recognizes a rejected password by code or message", () => {
    expect(isInvalidCredentialsError({ code: "invalid_credentials" })).toBe(true);
    expect(isInvalidCredentialsError(new Error("Invalid login credentials"))).toBe(true);
  });

  it.each([new Error("Failed to fetch"), { code: "over_request_rate_limit" }, null])(
    "does not match %s",
    (err) => {
      expect(isInvalidCredentialsError(err)).toBe(false);
    }
  );
});

describe("membership tracker", () => {
  it("reports a user change only once", () => {
    const tracker = createMembershipTracker();
    expect(tracker.setActiveUser("a")).toBe(true);
    expect(tracker.setActiveUser("a")).toBe(false);
    expect(tracker.setActiveUser("b")).toBe(true);
  });

  it("only the newest request counts", () => {
    const tracker = createMembershipTracker();
    const first = tracker.beginRequest();
    const second = tracker.beginRequest();
    expect(tracker.isLatest(first)).toBe(false);
    expect(tracker.isLatest(second)).toBe(true);
  });

  it("sign-out invalidates in-flight requests and forgets the user", () => {
    const tracker = createMembershipTracker();
    tracker.setActiveUser("a");
    const request = tracker.beginRequest();
    tracker.reset();
    expect(tracker.isLatest(request)).toBe(false);
    expect(tracker.setActiveUser("a")).toBe(true);
  });
});
