/**
 * Hub admin team (group) ops (service_role). Callers must verify the requester is Admin first.
 */
import {
  AuthError,
  PLATFORM_TOOL_IDS,
  createPlatformServiceClient as serviceClient,
} from "@workspace/auth/server";
import type { AdminGroupRow } from "./types";

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
