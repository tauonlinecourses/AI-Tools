import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type AuthUser = { id: string; email: string; last_sign_in_at?: string };

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  users: [] as { id: string; email: string; last_sign_in_at?: string }[],
  failOn: null as string | null,
  inviteFails: false,
  generateLinkFails: false,
  deleted: [] as string[],
}));

function fakeTable(name: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let op: "select" | "update" | "delete" | "insert" = "select";
  let patch: Row = {};
  let inserted: Row[] = [];

  const matching = () => (db.tables[name] ?? []).filter((r) => filters.every((f) => f(r)));

  async function run(): Promise<{ data: Row[] | null; error: Error | null }> {
    if (db.failOn === `${name}:${op}`) return { data: null, error: new Error("db failure") };
    if (op === "insert") {
      db.tables[name] = [...(db.tables[name] ?? []), ...inserted];
      return { data: inserted, error: null };
    }
    if (op === "update") {
      const rows = matching();
      rows.forEach((r) => Object.assign(r, patch));
      return { data: rows, error: null };
    }
    if (op === "delete") {
      const rows = matching();
      db.tables[name] = (db.tables[name] ?? []).filter((r) => !rows.includes(r));
      return { data: rows, error: null };
    }
    const rows = matching().map((r) =>
      name === "group_members"
        ? { ...r, groups: (db.tables.groups ?? []).find((g) => g.id === r.group_id) ?? null }
        : r
    );
    return { data: rows, error: null };
  }

  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      filters.push((r) => r[column] === value);
      return query;
    },
    in: (column: string, values: unknown[]) => {
      filters.push((r) => values.includes(r[column]));
      return query;
    },
    update: (next: Row) => {
      op = "update";
      patch = next;
      return query;
    },
    delete: () => {
      op = "delete";
      return query;
    },
    insert: (rows: Row | Row[]) => {
      op = "insert";
      inserted = Array.isArray(rows) ? rows : [rows];
      return query;
    },
    maybeSingle: async () => {
      const { data, error } = await run();
      return { data: data?.[0] ?? null, error };
    },
    then: <T>(resolve: (value: Awaited<ReturnType<typeof run>>) => T) => run().then(resolve),
  };
  return query;
}

function removeAccount(id: string) {
  db.users = db.users.filter((u) => u.id !== id);
  db.tables.profiles = db.tables.profiles.filter((p) => p.id !== id);
  db.tables.group_members = db.tables.group_members.filter((m) => m.user_id !== id);
  db.deleted.push(id);
}

const fakeClient = {
  from: fakeTable,
  auth: {
    admin: {
      listUsers: async () => ({ data: { users: db.users }, error: null }),
      getUserById: async (id: string) => ({
        data: { user: db.users.find((u) => u.id === id) ?? null },
        error: null,
      }),
      deleteUser: async (id: string) => {
        removeAccount(id);
        return { error: null };
      },
      inviteUserByEmail: async (email: string) => {
        if (db.inviteFails) return { data: { user: null }, error: { message: "smtp down" } };
        const user: AuthUser = { id: `new-${email}`, email };
        db.users.push(user);
        return { data: { user }, error: null };
      },
      generateLink: async ({ email }: { email: string }) => {
        if (db.generateLinkFails) return { data: null, error: { message: "link failed" } };
        const user: AuthUser = { id: `restored-${email}`, email };
        db.users.push(user);
        return {
          data: { user, properties: { action_link: "https://example.test/verify?token=t" } },
          error: null,
        };
      },
    },
  },
};

vi.mock("@workspace/auth/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workspace/auth/server")>()),
  createPlatformServiceClient: () => fakeClient,
}));

const { approveUser, rejectUser } = await import("./users");
const { sendInviteEmail } = await import("./invites");

function addUser(id: string, status: string | null, extra: Partial<AuthUser> = {}) {
  db.users.push({ id, email: `${id}@example.test`, ...extra });
  db.tables.profiles.push({ id, status, display_name: id, requested_group_id: null });
}

const status = (id: string) => db.tables.profiles.find((p) => p.id === id)?.status;
const memberGroups = (id: string) =>
  db.tables.group_members.filter((m) => m.user_id === id).map((m) => m.group_id);

beforeEach(() => {
  db.tables = {
    profiles: [],
    groups: [
      { id: "g1", name: "One", slug: "one" },
      { id: "g2", name: "Two", slug: "two" },
    ],
    group_members: [],
  };
  db.users = [];
  db.failOn = null;
  db.inviteFails = false;
  db.generateLinkFails = false;
  db.deleted = [];
});

describe("approveUser", () => {
  it("approves a pending user with the chosen groups", async () => {
    addUser("u1", "pending");
    await approveUser({ userId: "u1", groupIds: ["g1"], reviewerId: "admin" });
    expect(status("u1")).toBe("approved");
    expect(memberGroups("u1")).toEqual(["g1"]);
  });

  it.each(["approved", "rejected"])("refuses a %s user and changes nothing", async (from) => {
    addUser("u1", from);
    db.tables.group_members.push({ user_id: "u1", group_id: "g2" });
    await expect(
      approveUser({ userId: "u1", groupIds: ["g1"], reviewerId: "admin" })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(status("u1")).toBe(from);
    expect(memberGroups("u1")).toEqual(["g2"]);
  });

  it("leaves the user pending when setting groups fails", async () => {
    addUser("u1", "pending");
    db.failOn = "group_members:insert";
    await expect(
      approveUser({ userId: "u1", groupIds: ["g1"], reviewerId: "admin" })
    ).rejects.toThrow();
    expect(status("u1")).toBe("pending");
  });
});

describe("rejectUser", () => {
  it("rejects a pending user and removes memberships", async () => {
    addUser("u1", "pending");
    db.tables.group_members.push({ user_id: "u1", group_id: "g1" });
    await rejectUser({ userId: "u1", reviewerId: "admin" });
    expect(status("u1")).toBe("rejected");
    expect(memberGroups("u1")).toEqual([]);
  });

  it("refuses an approved user and keeps their access", async () => {
    addUser("u1", "approved");
    db.tables.group_members.push({ user_id: "u1", group_id: "g1" });
    await expect(
      rejectUser({ userId: "u1", reviewerId: "admin" })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(status("u1")).toBe("approved");
    expect(memberGroups("u1")).toEqual(["g1"]);
  });
});

describe("sendInviteEmail", () => {
  const email = "u1@example.test";

  it.each(["pending", "rejected"])("refuses a %s user without deleting them", async (from) => {
    addUser("u1", from);
    await expect(sendInviteEmail({ email })).rejects.toMatchObject({ statusCode: 409 });
    expect(db.deleted).toEqual([]);
    expect(status("u1")).toBe(from);
  });

  it("refuses a user who has already signed in", async () => {
    addUser("u1", "approved", { last_sign_in_at: "2026-11-01T00:00:00Z" });
    await expect(sendInviteEmail({ email })).rejects.toMatchObject({ statusCode: 409 });
    expect(db.deleted).toEqual([]);
  });

  it("re-invites an approved user who never signed in and keeps groups", async () => {
    addUser("u1", "approved");
    db.tables.group_members.push({ user_id: "u1", group_id: "g1" });
    const res = await sendInviteEmail({ email });
    expect(res.emailSent).toBe(true);
    expect(res.user.status).toBe("approved");
    expect(res.user.groups.map((g) => g.id)).toEqual(["g1"]);
  });

  it("restores the user when the email fails", async () => {
    addUser("u1", "approved");
    db.tables.group_members.push({ user_id: "u1", group_id: "g1" });
    db.inviteFails = true;
    await expect(sendInviteEmail({ email })).rejects.toMatchObject({ statusCode: 400 });
    expect(status(`restored-${email}`)).toBe("approved");
  });

  it("says so when the user cannot be restored", async () => {
    addUser("u1", "approved");
    db.tables.group_members.push({ user_id: "u1", group_id: "g1" });
    db.inviteFails = true;
    db.generateLinkFails = true;
    await expect(sendInviteEmail({ email })).rejects.toMatchObject({
      statusCode: 500,
      message: expect.stringContaining("could not be restored"),
    });
  });
});
