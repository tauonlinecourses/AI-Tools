import { createPlatformServiceClient as serviceClient } from "@workspace/auth/server";
import type { AccountStatus } from "./types";

/** Insert or update a `profiles` row with the given status (service_role). */
export async function ensureProfileStatus(
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
