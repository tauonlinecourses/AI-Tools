/**
 * Hub admin data ops (service_role). Callers must verify the requester is Admin first.
 */
import {
  ADMIN_GROUP_SLUG,
  AuthError,
  PLATFORM_TOOL_IDS,
  serviceClient,
} from "./platformAuth";

export type AccountStatus = "pending" | "approved" | "rejected";

export type AdminGroupSummary = {
  id: string;
  name: string;
  slug: string;
};

export type AdminUserRow = {
  id: string;
  email: string;
  displayName: string | null;
  status: AccountStatus;
  requestedGroupId: string | null;
  groups: AdminGroupSummary[];
};

const HUB_PROD_DEFAULT = "https://ai-tools-tauonline.vercel.app";

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/** Live hub origin for invite emails (never localhost — invitees cannot open it). */
function hubOrigin(): string {
  const raw =
    process.env.VITE_HUB_URL?.trim() ||
    process.env.HUB_URL?.trim() ||
    HUB_PROD_DEFAULT;
  const origin = raw.replace(/\/$/, "");
  try {
    if (isLocalHost(new URL(origin).hostname)) return HUB_PROD_DEFAULT;
  } catch {
    return HUB_PROD_DEFAULT;
  }
  return origin;
}

function defaultInviteRedirectTo(): string {
  return `${hubOrigin()}/auth/set-password`;
}

/** Prefer client-provided hub origin; rewrite localhost to live hub. */
function resolveInviteRedirectTo(redirectTo?: string | null): string {
  const raw = redirectTo?.trim() || "";
  if (!raw) return defaultInviteRedirectTo();
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return defaultInviteRedirectTo();
    }
    if (isLocalHost(url.hostname)) {
      return defaultInviteRedirectTo();
    }
    // Normalize to the set-password route on that origin.
    return `${url.origin}/auth/set-password`;
  } catch {
    return defaultInviteRedirectTo();
  }
}

function asAccountStatus(value: unknown): AccountStatus {
  if (value === "pending" || value === "rejected" || value === "approved") {
    return value;
  }
  return "approved";
}

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

/** Normalize + validate tool ids the admin UI may assign (hub catalog / PLATFORM_TOOL_IDS). */
function normalizeAssignableToolIds(raw: string[]): string[] {
  const toolIds = [...new Set(raw.map((t) => t.trim()).filter(Boolean))];
  for (const id of toolIds) {
    if (!isAllowedToolId(id)) {
      throw new AuthError(`Invalid tool id: ${id}`, 400);
    }
  }
  return toolIds;
}

/**
 * Tool ids already on a group that are not in this branch's PLATFORM_TOOL_IDS
 * (e.g. virtual-support from another WIP branch). Preserve them on update so
 * admin edits on main do not wipe in-progress entitlements.
 */
async function preservedUnknownToolIds(
  admin: ReturnType<typeof serviceClient>,
  groupId: string
): Promise<string[]> {
  const { data, error } = await admin
    .from("group_tools")
    .select("tool_id")
    .eq("group_id", groupId);
  if (error) throw error;
  return (data ?? [])
    .map((row) => String(row.tool_id))
    .filter((id) => !isAllowedToolId(id));
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
      status: asAccountStatus(p.status),
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
      status: profile?.status ?? "approved",
      requestedGroupId: profile?.requestedGroupId ?? null,
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
  if (!name) throw new AuthError("Team name is required", 400);

  const slug = (input.slug?.trim() ? slugify(input.slug) : slugify(name)) || "";
  if (!slug) {
    throw new AuthError(
      "Slug is required (use Latin letters for Hebrew team names)",
      400
    );
  }

  const toolIds = normalizeAssignableToolIds(input.toolIds);

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
      throw new AuthError("A team with this slug already exists", 409);
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
  if (!id) throw new AuthError("Team id is required", 400);
  if (!name) throw new AuthError("Team name is required", 400);
  if (!slug) {
    throw new AuthError(
      "Slug is required (use Latin letters for Hebrew team names)",
      400
    );
  }

  const assignableToolIds = normalizeAssignableToolIds(input.toolIds);

  const admin = serviceClient();
  const preserved = await preservedUnknownToolIds(admin, id);
  const toolIds = [...new Set([...assignableToolIds, ...preserved])];

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
      throw new AuthError("A team with this slug already exists", 409);
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

async function ensureProfileStatus(
  userId: string,
  status: AccountStatus,
  requestedGroupId: string | null = null
): Promise<void> {
  const admin = serviceClient();
  const { data: existing, error: findErr } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (findErr) throw findErr;

  if (!existing) {
    const { error: insErr } = await admin.from("profiles").insert({
      id: userId,
      status,
      requested_group_id: requestedGroupId,
    });
    if (insErr) throw insErr;
    return;
  }

  const { error: updErr } = await admin
    .from("profiles")
    .update({
      status,
      requested_group_id: requestedGroupId,
    })
    .eq("id", userId);
  if (updErr) throw updErr;
}

type GenerateLinkProperties = {
  action_link?: string;
  hashed_token?: string;
  redirect_to?: string;
};

/**
 * Keep Supabase's official `action_link` token intact; only force live-hub
 * `redirect_to`. Rebuilding from `hashed_token` alone can produce
 * otp_expired / invalid links. Error redirects still land on whatever is set
 * as Auth Site URL in the dashboard (must be the prod hub, not localhost:3000).
 */
function inviteActionLinkFromProperties(
  properties: GenerateLinkProperties | null | undefined,
  redirectTo: string
): string | null {
  const supabaseUrl = (
    process.env.PLATFORM_SUPABASE_URL ||
    process.env.VITE_PLATFORM_SUPABASE_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");

  const raw = properties?.action_link?.trim();
  if (raw) {
    try {
      const url = new URL(raw);
      // Official links can be rooted at Site URL (e.g. localhost:3000) — move
      // verify onto the Supabase API host while keeping the same token params.
      if (isLocalHost(url.hostname) && supabaseUrl) {
        const token =
          url.searchParams.get("token") ||
          url.searchParams.get("token_hash") ||
          properties?.hashed_token?.trim() ||
          "";
        const type = url.searchParams.get("type") || "invite";
        if (!token) return null;
        const fixed = new URL(`${supabaseUrl}/auth/v1/verify`);
        if (url.searchParams.has("token_hash")) {
          fixed.searchParams.set("token_hash", token);
        } else {
          fixed.searchParams.set("token", token);
        }
        fixed.searchParams.set("type", type);
        fixed.searchParams.set("redirect_to", redirectTo);
        return fixed.toString();
      }

      url.searchParams.set("redirect_to", redirectTo);
      url.searchParams.delete("redirectTo");
      return url.toString();
    } catch {
      return raw;
    }
  }

  const token = properties?.hashed_token?.trim();
  if (!token || !supabaseUrl) return null;
  const url = new URL(`${supabaseUrl}/auth/v1/verify`);
  url.searchParams.set("token", token);
  url.searchParams.set("type", "invite");
  url.searchParams.set("redirect_to", redirectTo);
  return url.toString();
}

async function generateInviteActionLink(
  email: string,
  redirectTo: string
): Promise<string | null> {
  const admin = serviceClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      redirectTo,
      data: { status: "approved" },
    },
  });
  if (error) throw error;
  return inviteActionLinkFromProperties(
    (data as { properties?: GenerateLinkProperties } | null)?.properties,
    redirectTo
  );
}

/** Create approved user + groups; returns shareable invite link (no email yet). */
export async function inviteUser(input: {
  email: string;
  groupIds: string[];
  redirectTo?: string | null;
}): Promise<{ user: AdminUserRow; actionLink: string | null }> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new AuthError("A valid email is required", 400);
  }
  const uniqueGroupIds = [
    ...new Set(input.groupIds.map((g) => g.trim()).filter(Boolean)),
  ];
  if (uniqueGroupIds.length === 0) {
    throw new AuthError("Select at least one team", 400);
  }

  const admin = serviceClient();
  const redirectTo = resolveInviteRedirectTo(input.redirectTo);

  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      redirectTo,
      data: { status: "approved" },
    },
  });
  if (error) {
    throw new AuthError(error.message || "Invite failed", 400);
  }

  const userId = data.user?.id ?? null;
  let actionLink = inviteActionLinkFromProperties(
    (data as { properties?: GenerateLinkProperties } | null)?.properties,
    redirectTo
  );
  if (!actionLink) {
    actionLink = await generateInviteActionLink(email, redirectTo);
  }

  if (!userId) throw new AuthError("Invite failed — no user created", 500);

  await ensureProfileStatus(userId, "approved", null);
  await setUserGroups(userId, uniqueGroupIds);

  const users = await listAdminUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) {
    throw new AuthError("User created but could not be loaded", 500);
  }

  return { user, actionLink };
}

/**
 * Send a real Supabase invite email for an already-created user.
 * Auth cannot mail an invite after `generateLink` created the account, so we
 * re-invite: delete + `inviteUserByEmail`, then restore groups / approved status.
 */
export async function sendInviteEmail(input: {
  email: string;
  redirectTo?: string | null;
}): Promise<{
  emailSent: boolean;
  actionLink: string | null;
  user: AdminUserRow;
}> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new AuthError("A valid email is required", 400);
  }

  const existing = (await listAdminUsers()).find(
    (u) => u.email.trim().toLowerCase() === email
  );
  if (!existing) {
    throw new AuthError("User not found — create the user first", 404);
  }

  const groupIds = existing.groups.map((g) => g.id);
  const admin = serviceClient();
  const redirectTo = resolveInviteRedirectTo(input.redirectTo);

  const { error: delErr } = await admin.auth.admin.deleteUser(existing.id);
  if (delErr) {
    throw new AuthError(delErr.message || "Could not prepare invite email", 400);
  }

  const invite = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { status: "approved" },
  });
  if (invite.error || !invite.data.user) {
    // Best-effort recreate so the admin is not left without the user.
    try {
      await inviteUser({ email, groupIds, redirectTo });
    } catch {
      /* ignore secondary failure */
    }
    throw new AuthError(
      invite.error?.message || "Invite email failed",
      400
    );
  }

  const userId = invite.data.user.id;
  await ensureProfileStatus(userId, "approved", null);
  if (groupIds.length > 0) {
    await setUserGroups(userId, groupIds);
  }

  // Do not call generateLink here — a second invite token invalidates the one
  // already embedded in the email Supabase just sent (otp_expired / no session
  // on /auth/set-password). Invitee must use the email link; there is no
  // shareable action_link from inviteUserByEmail.
  const users = await listAdminUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) {
    throw new AuthError("Invite email sent but user could not be loaded", 500);
  }

  return { emailSent: true, actionLink: null, user };
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

  let groupIds = Array.isArray(input.groupIds)
    ? [...new Set(input.groupIds.map((g) => g.trim()).filter(Boolean))]
    : [];
  if (groupIds.length === 0 && profile.requested_group_id) {
    groupIds = [String(profile.requested_group_id)];
  }
  if (groupIds.length === 0) {
    throw new AuthError("Select at least one team to approve", 400);
  }

  const { error: updErr } = await admin
    .from("profiles")
    .update({
      status: "approved",
      requested_group_id: null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: input.reviewerId,
    })
    .eq("id", userId);
  if (updErr) throw updErr;

  await setUserGroups(userId, groupIds);

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
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (profErr) throw profErr;
  if (!profile) throw new AuthError("User profile not found", 404);

  const { error: updErr } = await admin
    .from("profiles")
    .update({
      status: "rejected",
      requested_group_id: null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: input.reviewerId,
    })
    .eq("id", userId);
  if (updErr) throw updErr;

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

/** Public groups list for self-registration (excludes Admin). */
export async function listPublicGroups(): Promise<AdminGroupSummary[]> {
  const admin = serviceClient();
  const { data, error } = await admin
    .from("groups")
    .select("id, name, slug")
    .order("name");
  if (error) throw error;
  return (data ?? [])
    .filter((g) => String(g.slug) !== ADMIN_GROUP_SLUG)
    .map((g) => ({
      id: String(g.id),
      name: String(g.name),
      slug: String(g.slug),
    }));
}

export async function registerPendingUser(input: {
  email: string;
  password: string;
  requestedGroupId: string;
}): Promise<{ userId: string }> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const requestedGroupId = input.requestedGroupId.trim();

  if (!email || !email.includes("@")) {
    throw new AuthError("A valid email is required", 400);
  }
  if (!password || password.length < 6) {
    throw new AuthError("Password must be at least 6 characters", 400);
  }
  if (!requestedGroupId) {
    throw new AuthError("Select a team", 400);
  }

  const admin = serviceClient();
  const { data: group, error: gErr } = await admin
    .from("groups")
    .select("id, slug")
    .eq("id", requestedGroupId)
    .maybeSingle();
  if (gErr) throw gErr;
  if (!group) throw new AuthError("Team not found", 400);
  if (String(group.slug) === ADMIN_GROUP_SLUG) {
    throw new AuthError("Cannot self-register into the Admin team", 400);
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      status: "pending",
      requested_group_id: requestedGroupId,
    },
  });
  if (error) {
    const msg = error.message || "Registration failed";
    const status =
      msg.toLowerCase().includes("already") ||
      msg.toLowerCase().includes("registered")
        ? 409
        : 400;
    throw new AuthError(msg, status);
  }
  if (!data.user) throw new AuthError("Registration failed", 500);

  await ensureProfileStatus(data.user.id, "pending", requestedGroupId);
  return { userId: data.user.id };
}
