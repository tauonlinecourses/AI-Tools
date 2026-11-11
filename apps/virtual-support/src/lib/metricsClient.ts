/**
 * Browser → admin metrics BFF. The server re-checks Admin group membership;
 * hiding the tab in the UI is only a convenience.
 */

import { useEffect, useState } from "react";
import {
  ADMIN_GROUP_SLUG,
  authFetch,
  listUserGroups,
} from "@workspace/auth/client";
import type { DashboardMetrics } from "./dashboardTypes";

export type { DashboardMetrics } from "./dashboardTypes";

export async function fetchDashboardMetrics(
  days: number
): Promise<DashboardMetrics> {
  const res = await authFetch("/api/admin-metrics", {
    method: "POST",
    body: JSON.stringify({ days }),
  });
  const body = (await res.json().catch(() => null)) as
    | (DashboardMetrics & { error?: string })
    | null;
  if (!res.ok || !body) {
    throw new Error(body?.error || `metrics failed (${res.status})`);
  }
  return body;
}

/**
 * true when the signed-in user is in the platform Admin group.
 * Uses the canonical slug only, to match the server check (assertUserIsAdmin).
 */
export function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let cancelled = false;
    listUserGroups()
      .then((groups) => {
        if (!cancelled) {
          setIsAdmin(groups.some((g) => g.slug === ADMIN_GROUP_SLUG));
        }
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return isAdmin;
}
