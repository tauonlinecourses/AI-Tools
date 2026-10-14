/**
 * Hub admin data ops (service_role). Callers must verify the requester is Admin first.
 */
import {
  AuthError,
  PLATFORM_TOOL_IDS,
  serviceClient,
} from "./platformAuth";

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

function isAllowedToolId(value: string): boolean {
  return (PLATFORM_TOOL_IDS as readonly string[]).includes(value);
}

function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const admin = serviceClient();
  const [{ data: authData, error: authErr }, { data: profiles, error: profErr }, { data: members, error: memErr }] =
    await Promise.all([
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      admin.from("profiles").select("id, display_name"),
      admin
        .from("group_members")
        .select("user_id, group_id, groups(id, name, slug)"),
    ]);

  if (authErr) throw authErr;
  if (profErr) throw profErr;
  if (memErr) throw memErr;

  const displayById = new Map<string, string | null>();
  for (const p of profiles ?? []) {
    displayById.set(String(p.id), (p.display_name as string | null) ?? null);
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
    return {
      id: u.id,
      email: u.email ?? "",
      displayName: displayById.get(u.id) ?? null,
      groups,
    };
  });

  users.sort((a, b) => a.email.localeCompare(b.email, "en"));
  return users;
}

export async function listAdminGroups(): Promise<AdminGroupRow[]> {
  const admin = serviceClient();
  const [
    { data: groups, error: gErr },
    { data: tools, error: tErr },
    { data: members, error: mErr },
  ] = await Promise.all([
    admin.from("groups").select("id, name, slug, description").order("name"),
    admin.from("group_tools").select("group_id, tool_id"),
    admin.from("group_members").select("group_id"),
  ]);
  if (gErr) throw gErr;
  if (tErr) throw tErr;
  if (mErr) throw mErr;

  const toolMap = new Map<string, string[]>();
  for (const row of tools ?? []) {
    const id = String(row.group_id);
    const list = toolMap.get(id) ?? [];
    list.push(String(row.tool_id));
    toolMap.set(id, list);
  }

  const countMap = new Map<string, number>();
  for (const row of members ?? []) {
    const id = String(row.group_id);
    countMap.set(id, (countMap.get(id) ?? 0) + 1);
  }

  return (groups ?? []).map((g) => ({
    id: String(g.id),
    name: String(g.name),
    slug: String(g.slug),
    description: (g.description as string | null) ?? null,
    toolIds: (toolMap.get(String(g.id)) ?? []).sort(),
    memberCount: countMap.get(String(g.id)) ?? 0,
  }));
}

export async function createAdminGroup(input: {
  name: string;
  slug?: string;
  description?: string | null;
  toolIds: string[];
}): Promise<AdminGroupRow> {
  const name = input.name.trim();
  if (!name) throw new AuthError("Group name is required", 400);

  const slug = (input.slug?.trim() ? slugify(input.slug) : slugify(name)) || "";
  if (!slug) {
    throw new AuthError(
      "Slug is required (use Latin letters for Hebrew group names)",
      400
    );
  }

  const toolIds = [...new Set(input.toolIds.map((t) => t.trim()).filter(Boolean))];
  for (const id of toolIds) {
    if (!isAllowedToolId(id)) {
      throw new AuthError(`Invalid tool id: ${id}`, 400);
    }
  }

  const admin = serviceClient();
  const { data: group, error } = await admin
    .from("groups")
    .insert({
      name,
      slug,
      description: input.description?.trim() || null,
    })
    .select("id, name, slug, description")
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new AuthError("A group with this slug already exists", 409);
    }
    throw error;
  }

  if (toolIds.length > 0) {
    const { error: toolsErr } = await admin.from("group_tools").insert(
      toolIds.map((tool_id) => ({ group_id: group.id, tool_id }))
    );
    if (toolsErr) throw toolsErr;
  }

  return {
    id: String(group.id),
    name: String(group.name),
    slug: String(group.slug),
    description: (group.description as string | null) ?? null,
    toolIds: toolIds.sort(),
    memberCount: 0,
  };
}

export async function updateAdminGroup(input: {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  toolIds: string[];
}): Promise<AdminGroupRow> {
  const id = input.id.trim();
  const name = input.name.trim();
  const slug = slugify(input.slug);
  if (!id) throw new AuthError("Group id is required", 400);
  if (!name) throw new AuthError("Group name is required", 400);
  if (!slug) {
    throw new AuthError(
      "Slug is required (use Latin letters for Hebrew group names)",
      400
    );
  }

  const toolIds = [...new Set(input.toolIds.map((t) => t.trim()).filter(Boolean))];
  for (const tid of toolIds) {
    if (!isAllowedToolId(tid)) {
      throw new AuthError(`Invalid tool id: ${tid}`, 400);
    }
  }

  const admin = serviceClient();
  const { data: group, error } = await admin
    .from("groups")
    .update({
      name,
      slug,
      description: input.description?.trim() || null,
    })
    .eq("id", id)
    .select("id, name, slug, description")
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new AuthError("A group with this slug already exists", 409);
    }
    throw error;
  }

  const { error: delErr } = await admin
    .from("group_tools")
    .delete()
    .eq("group_id", id);
  if (delErr) throw delErr;

  if (toolIds.length > 0) {
    const { error: toolsErr } = await admin.from("group_tools").insert(
      toolIds.map((tool_id) => ({ group_id: id, tool_id }))
    );
    if (toolsErr) throw toolsErr;
  }

  const { count, error: countErr } = await admin
    .from("group_members")
    .select("*", { count: "exact", head: true })
    .eq("group_id", id);
  if (countErr) throw countErr;

  return {
    id: String(group.id),
    name: String(group.name),
    slug: String(group.slug),
    description: (group.description as string | null) ?? null,
    toolIds: toolIds.sort(),
    memberCount: count ?? 0,
  };
}

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
      throw new AuthError("One or more groups were not found", 400);
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
  if (!group) throw new AuthError("Group not found", 404);

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
