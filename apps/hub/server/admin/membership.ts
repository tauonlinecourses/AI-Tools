/**
 * Hub admin team membership ops (service_role). Callers must verify the requester is Admin first.
 */
import {
  AuthError,
  createPlatformServiceClient as serviceClient,
} from "@workspace/auth/server";
import type { AdminGroupSummary } from "./types";

export async function setUserGroups(
  userId: string,
  groupIds: string[]
): Promise<AdminGroupSummary[]> {
  const uid = userId.trim();
  if (!uid) throw new AuthError("userId is required", 400);

  const uniqueIds = [...new Set(groupIds.map((g) => g.trim()).filter(Boolean))];
  const admin = serviceClient();

  if (uniqueIds.length > 0) {
    const { data: existing, error: exErr } = await admin
      .from("groups")
      .select("id")
      .in("id", uniqueIds);
    if (exErr) throw exErr;
    if ((existing ?? []).length !== uniqueIds.length) {
      throw new AuthError("One or more teams were not found", 400);
    }
  }

  const { error: delErr } = await admin
    .from("group_members")
    .delete()
    .eq("user_id", uid);
  if (delErr) throw delErr;

  if (uniqueIds.length > 0) {
    const { error: insErr } = await admin.from("group_members").insert(
      uniqueIds.map((group_id) => ({ group_id, user_id: uid }))
    );
    if (insErr) throw insErr;
  }

  const { data, error } = await admin
    .from("group_members")
    .select("groups(id, name, slug)")
    .eq("user_id", uid);
  if (error) throw error;

  const groups: AdminGroupSummary[] = [];
  for (const row of data ?? []) {
    const g = row.groups as
      | { id: string; name: string; slug: string }
      | { id: string; name: string; slug: string }[]
      | null;
    const group = Array.isArray(g) ? g[0] : g;
    if (!group) continue;
    groups.push({
      id: String(group.id),
      name: String(group.name),
      slug: String(group.slug),
    });
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name, "he"));
}

/** Replace all members of a group with the given user ids. */
export async function setGroupMembers(
  groupId: string,
  userIds: string[]
): Promise<{ memberCount: number }> {
  const gid = groupId.trim();
  if (!gid) throw new AuthError("groupId is required", 400);

  const uniqueIds = [...new Set(userIds.map((u) => u.trim()).filter(Boolean))];
  const admin = serviceClient();

  const { data: group, error: gErr } = await admin
    .from("groups")
    .select("id")
    .eq("id", gid)
    .maybeSingle();
  if (gErr) throw gErr;
  if (!group) throw new AuthError("Team not found", 404);

  if (uniqueIds.length > 0) {
    const { data: profiles, error: pErr } = await admin
      .from("profiles")
      .select("id")
      .in("id", uniqueIds);
    if (pErr) throw pErr;
    // Auth users without a profile row yet — still allow membership by id
    // if they exist in auth; fall back to accepting all ids when profiles miss some.
    const found = new Set((profiles ?? []).map((p) => String(p.id)));
    const missing = uniqueIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      // Ensure profile rows exist for auth users (trigger may have missed them).
      const { error: upsertErr } = await admin.from("profiles").upsert(
        missing.map((id) => ({ id })),
        { onConflict: "id", ignoreDuplicates: true }
      );
      if (upsertErr) throw upsertErr;
    }
  }

  const { error: delErr } = await admin
    .from("group_members")
    .delete()
    .eq("group_id", gid);
  if (delErr) throw delErr;

  if (uniqueIds.length > 0) {
    const { error: insErr } = await admin.from("group_members").insert(
      uniqueIds.map((user_id) => ({ group_id: gid, user_id }))
    );
    if (insErr) throw insErr;
  }

  return { memberCount: uniqueIds.length };
}
