/**
 * Browser → BFF helper for Tau-Support data operations.
 */

import { authFetch, getPlatformAccessToken } from "@workspace/auth/client";

export async function tauData<T = unknown>(
  action: string,
  payload?: unknown
): Promise<T> {
  const token = await getPlatformAccessToken();
  if (!token) {
    throw new Error("Not signed in");
  }
  const res = await authFetch("/api/tau-data", {
    method: "POST",
    body: JSON.stringify({ action, payload }),
  });
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | { error?: string }
    | null;
  if (!res.ok) {
    throw new Error(
      (body && typeof body === "object" && "error" in body && body.error) ||
        `tau-data failed (${res.status})`
    );
  }
  return body as T;
}
