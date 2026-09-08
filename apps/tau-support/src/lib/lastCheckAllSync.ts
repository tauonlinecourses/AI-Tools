/**
 * Sync / hydrate the homepage "last בדוק הכל" run via Supabase so localhost
 * and Vercel share the same "העדכון האחרון היה ב" timestamp.
 */

import type { LastCheckAllRun } from "./checkAllRun";
import { isSupabaseConfigured, supabase } from "./supabase";

const SINGLETON_ID = "singleton";

export interface LastCheckAllSyncResult {
  ok: boolean;
  skipped?: boolean;
  message?: string;
  run?: LastCheckAllRun | null;
}

interface LastCheckAllRow {
  id: string;
  completed_at: string;
  scanned: number;
  total: number;
  upserted: number;
  incomplete: boolean;
}

function rowToRun(row: LastCheckAllRow): LastCheckAllRun {
  return {
    completedAt: row.completed_at,
    scanned: row.scanned,
    total: row.total,
    upserted: row.upserted,
    incomplete: Boolean(row.incomplete),
  };
}

/** Persist a completed/stopped check-all run (fire-and-forget safe). */
export async function syncLastCheckAllToSupabase(
  run: LastCheckAllRun
): Promise<LastCheckAllSyncResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: true, skipped: true };
  }

  const { error } = await supabase.from("last_check_all").upsert(
    {
      id: SINGLETON_ID,
      completed_at: run.completedAt,
      scanned: run.scanned,
      total: run.total,
      upserted: run.upserted,
      incomplete: run.incomplete,
    },
    { onConflict: "id" }
  );

  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, run };
}

/** Load the shared last check-all run from Supabase (null when empty). */
export async function hydrateLastCheckAllFromSupabase(): Promise<LastCheckAllSyncResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: true, skipped: true, run: null };
  }

  const { data, error } = await supabase
    .from("last_check_all")
    .select("id,completed_at,scanned,total,upserted,incomplete")
    .eq("id", SINGLETON_ID)
    .maybeSingle();

  if (error) {
    return { ok: false, message: error.message, run: null };
  }
  if (!data) {
    return { ok: true, run: null };
  }

  return { ok: true, run: rowToRun(data as LastCheckAllRow) };
}

/**
 * Prefer the newer of local vs remote by `completedAt`. When remote wins,
 * caller should mirror it into localStorage.
 */
export function preferNewerLastCheckAll(
  local: LastCheckAllRun | null,
  remote: LastCheckAllRun | null
): LastCheckAllRun | null {
  if (!local) return remote;
  if (!remote) return local;
  const localMs = Date.parse(local.completedAt);
  const remoteMs = Date.parse(remote.completedAt);
  if (Number.isNaN(localMs)) return remote;
  if (Number.isNaN(remoteMs)) return local;
  return remoteMs >= localMs ? remote : local;
}
