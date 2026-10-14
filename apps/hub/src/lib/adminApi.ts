import { authFetch } from "@workspace/auth/client";

export type AdminGroupSummary = {
  id: string;
  name: string;
  slug: string;
};

export type AdminUserRow = {
  id: string;
  email: string;
  displayName: string | null;
  groups: AdminGroupSummary[];
};

export type AdminGroupRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  toolIds: string[];
  memberCount: number;
};

async function parseJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | { error?: string }
    | null;
  if (!res.ok) {
    throw new Error(
      (body && "error" in body && body.error) ||
        `Admin request failed (${res.status})`
    );
  }
  return body as T;
}

export async function fetchAdminUsers(): Promise<AdminUserRow[]> {
  const res = await authFetch("/api/admin?resource=users");
  const data = await parseJson<{ users: AdminUserRow[] }>(res);
  return data.users ?? [];
}

export async function fetchAdminGroups(): Promise<AdminGroupRow[]> {
  const res = await authFetch("/api/admin?resource=groups");
  const data = await parseJson<{ groups: AdminGroupRow[] }>(res);
  return data.groups ?? [];
}

export async function createGroup(input: {
  name: string;
  slug?: string;
  description?: string | null;
  toolIds: string[];
}): Promise<AdminGroupRow> {
  const res = await authFetch("/api/admin", {
    method: "POST",
    body: JSON.stringify({ action: "createGroup", ...input }),
  });
  const data = await parseJson<{ group: AdminGroupRow }>(res);
  return data.group;
}

export async function updateGroup(input: {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  toolIds: string[];
}): Promise<AdminGroupRow> {
  const res = await authFetch("/api/admin", {
    method: "POST",
    body: JSON.stringify({ action: "updateGroup", ...input }),
  });
  const data = await parseJson<{ group: AdminGroupRow }>(res);
  return data.group;
}

export async function saveUserGroups(
  userId: string,
  groupIds: string[]
): Promise<AdminGroupSummary[]> {
  const res = await authFetch("/api/admin", {
    method: "POST",
    body: JSON.stringify({
      action: "setUserGroups",
      userId,
      groupIds,
    }),
  });
  const data = await parseJson<{ groups: AdminGroupSummary[] }>(res);
  return data.groups ?? [];
}

export async function saveGroupMembers(
  groupId: string,
  userIds: string[]
): Promise<{ memberCount: number }> {
  const res = await authFetch("/api/admin", {
    method: "POST",
    body: JSON.stringify({
      action: "setGroupMembers",
      groupId,
      userIds,
    }),
  });
  return parseJson<{ memberCount: number }>(res);
}
