/**
 * Public self-registration ops (service_role). No caller auth: used by `/api/register`.
 */
import {
  ADMIN_GROUP_SLUG,
  AuthError,
  createPlatformServiceClient as serviceClient,
} from "@workspace/auth/server";
import { ensureProfileStatus } from "./admin/profiles";
import type { AdminGroupSummary } from "./admin/types";

export type PublicGroupRow = AdminGroupSummary & { toolIds: string[] };

/** Public groups list for self-registration + hub catalog strip (excludes Admin). */
export async function listPublicGroups(): Promise<PublicGroupRow[]> {
  const admin = serviceClient();
  const [
    { data: groups, error: gErr },
    { data: tools, error: tErr },
  ] = await Promise.all([
    admin.from("groups").select("id, name, slug").order("name"),
    admin.from("group_tools").select("group_id, tool_id"),
  ]);
  if (gErr) throw gErr;
  if (tErr) throw tErr;

  const toolMap = new Map<string, string[]>();
  for (const row of tools ?? []) {
    const id = String(row.group_id);
    const list = toolMap.get(id) ?? [];
    list.push(String(row.tool_id));
    toolMap.set(id, list);
  }

  const LEARNING_SYSTEMS_SLUG = "learning-systems-team";

  return (groups ?? [])
    .filter((g) => String(g.slug) !== ADMIN_GROUP_SLUG)
    .map((g) => ({
      id: String(g.id),
      name: String(g.name),
      slug: String(g.slug),
      toolIds: (toolMap.get(String(g.id)) ?? []).sort(),
    }))
    .sort((a, b) => {
      if (a.slug === LEARNING_SYSTEMS_SLUG) return -1;
      if (b.slug === LEARNING_SYSTEMS_SLUG) return 1;
      return a.name.localeCompare(b.name, "he");
    });
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
