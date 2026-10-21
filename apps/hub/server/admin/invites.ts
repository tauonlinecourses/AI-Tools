/**
 * Hub admin invite ops (service_role). Callers must verify the requester is Admin first.
 */
import {
  AuthError,
  createPlatformServiceClient as serviceClient,
} from "@workspace/auth/server";
import { isLocalHost, resolveInviteRedirectTo } from "./hubOrigin";
import { setUserGroups } from "./membership";
import { ensureProfileStatus } from "./profiles";
import type { AdminUserRow } from "./types";
import { listAdminUsers } from "./users";

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
