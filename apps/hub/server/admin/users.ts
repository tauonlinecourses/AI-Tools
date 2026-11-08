/**
 * Hub admin user ops (service_role). Callers must verify the requester is Admin first.
 */
import {
  AuthError,
  createPlatformServiceClient as serviceClient,
  normalizeAccountStatus,
} from "@workspace/auth/server";
import { setUserGroups } from "./membership";
import type { AccountStatus, AdminGroupSummary, AdminUserRow } from "./types";

const NOT_PENDING_MESSAGE = "Only pending users can be approved or rejected";

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const admin = serviceClient();
  const [{ data: authData, error: authErr }, { data: profiles, error: profErr }, { data: members, error: memErr }] =
    await Promise.all([
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      admin
        .from("profiles")
        .select("id, display_name, status, requested_group_id"),
      admin
        .from("group_members")
        .select("user_id, group_id, groups(id, name, slug)"),
    ]);

  if (authErr) throw authErr;
  if (profErr) throw profErr;
  if (memErr) throw memErr;

  const profileById = new Map<
    string,
    {
      displayName: string | null;
      status: AccountStatus;
      requestedGroupId: string | null;
    }
  >();
  for (const p of profiles ?? []) {
    profileById.set(String(p.id), {
      displayName: (p.display_name as string | null) ?? null,
      status: normalizeAccountStatus(p.status),
      requestedGroupId:
        p.requested_group_id != null ? String(p.requested_group_id) : null,
    });
  }

  const groupsByUser = new Map<string, AdminGroupSummary[]>();
  for (const row of members ?? []) {
    const userId = String(row.user_id);
    const g = row.groups as
      | { id: string; name: string; slug: string }
      | { id: string; name: string; slug: string }[]
      | null;
    const group = Array.isArray(g) ? g[0] : g;
    if (!group) continue;
    const list = groupsByUser.get(userId) ?? [];
    list.push({
      id: String(group.id),
      name: String(group.name),
      slug: String(group.slug),
    });
    groupsByUser.set(userId, list);
  }

  const users = (authData?.users ?? []).map((u) => {
    const groups = (groupsByUser.get(u.id) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name, "he")
    );
    const profile = profileById.get(u.id);
    return {
      id: u.id,
      email: u.email ?? "",
      displayName: profile?.displayName ?? null,
      status: profile?.status ?? "pending",
      requestedGroupId: profile?.requestedGroupId ?? null,
      groups,
    };
  });

  users.sort((a, b) => a.email.localeCompare(b.email, "en"));
  return users;
}

export async function approveUser(input: {
  userId: string;
  groupIds?: string[];
  reviewerId: string;
}): Promise<AdminUserRow> {
  const userId = input.userId.trim();
  if (!userId) throw new AuthError("userId is required", 400);

  const admin = serviceClient();
  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("id, status, requested_group_id")
    .eq("id", userId)
    .maybeSingle();
  if (profErr) throw profErr;
  if (!profile) throw new AuthError("User profile not found", 404);
  if (profile.status !== "pending") {
    throw new AuthError(NOT_PENDING_MESSAGE, 409);
  }

  let groupIds = Array.isArray(input.groupIds)
    ? [...new Set(input.groupIds.map((g) => g.trim()).filter(Boolean))]
    : [];
  if (groupIds.length === 0 && profile.requested_group_id) {
    groupIds = [String(profile.requested_group_id)];
  }
  if (groupIds.length === 0) {
    throw new AuthError("Select at least one team to approve", 400);
  }

  // Groups first: if this fails the user is still pending and can be retried.
  await setUserGroups(userId, groupIds);

  const { data: approved, error: updErr } = await admin
    .from("profiles")
    .update({
      status: "approved",
      requested_group_id: null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: input.reviewerId,
    })
    .eq("id", userId)
    .eq("status", "pending")
    .select("id");
  if (updErr) throw updErr;
  if (!approved?.length) throw new AuthError(NOT_PENDING_MESSAGE, 409);

  const users = await listAdminUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) throw new AuthError("Approved user could not be loaded", 500);
  return user;
}

export async function rejectUser(input: {
  userId: string;
  reviewerId: string;
}): Promise<AdminUserRow> {
  const userId = input.userId.trim();
  if (!userId) throw new AuthError("userId is required", 400);

  const admin = serviceClient();
  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("id, status")
    .eq("id", userId)
    .maybeSingle();
  if (profErr) throw profErr;
  if (!profile) throw new AuthError("User profile not found", 404);
  if (profile.status !== "pending") {
    throw new AuthError(NOT_PENDING_MESSAGE, 409);
  }

  const { data: rejected, error: updErr } = await admin
    .from("profiles")
    .update({
      status: "rejected",
      requested_group_id: null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: input.reviewerId,
    })
    .eq("id", userId)
    .eq("status", "pending")
    .select("id");
  if (updErr) throw updErr;
  if (!rejected?.length) throw new AuthError(NOT_PENDING_MESSAGE, 409);

  const { error: delErr } = await admin
    .from("group_members")
    .delete()
    .eq("user_id", userId);
  if (delErr) throw delErr;

  const users = await listAdminUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) throw new AuthError("Rejected user could not be loaded", 500);
  return user;
}

/** Permanently delete Auth user (profiles / memberships cascade). */
export async function removeUser(input: {
  userId: string;
  actorId: string;
}): Promise<{ removed: true }> {
  const userId = input.userId.trim();
  if (!userId) throw new AuthError("userId is required", 400);
  if (userId === input.actorId) {
    throw new AuthError("You cannot remove your own account", 400);
  }

  const admin = serviceClient();
  const { data: authData, error: getErr } =
    await admin.auth.admin.getUserById(userId);
  if (getErr) throw getErr;
  if (!authData.user) throw new AuthError("User not found", 404);

  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) {
    throw new AuthError(delErr.message || "Failed to remove user", 400);
  }
  return { removed: true };
}
