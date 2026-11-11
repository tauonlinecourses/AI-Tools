/**
 * Loads ask_log + document data for the admin dashboard and aggregates it.
 * Callers must check admin access first (api/admin-metrics.ts, vite dev).
 */

import { createVsServiceClient } from "./vsSupabase.js";
import { documentContentHash } from "./docPlainText.js";
import {
  computeDashboardMetrics,
  type DashboardMetrics,
  type IndexFreshness,
  type MetricsDocument,
  type MetricsLogRow,
} from "./dashboardMetrics.js";

const ALLOWED_DAYS = [7, 30, 90] as const;
const PAGE_SIZE = 1000; // PostgREST default max rows per request
const MAX_ROWS = 50_000;

const LOG_COLUMNS = [
  "created_at",
  "session_id",
  "pipeline_version",
  "outcome",
  "vote",
  "pages_sent",
  "cited_document_ids",
  "best_similarity",
  "latency_ms",
  "usage",
  "input_tokens",
  "output_tokens",
  "embed_tokens",
  "cost_usd",
].join(", ");

export function parseDays(value: unknown): number {
  const n = Number(value);
  return (ALLOWED_DAYS as readonly number[]).includes(n) ? n : 7;
}

export async function getDashboardMetrics(
  daysInput: unknown
): Promise<DashboardMetrics> {
  const days = parseDays(daysInput);
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 24 * 3600 * 1000);
  from.setUTCHours(0, 0, 0, 0);

  const client = createVsServiceClient();

  const rows: MetricsLogRow[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from("ask_log")
      .select(LOG_COLUMNS)
      .gte("created_at", from.toISOString())
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as unknown as MetricsLogRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }

  const [docsRes, foldersRes, chunkRes] = await Promise.all([
    client.from("documents").select("id, title, body, folder_id, content_hash"),
    client.from("folders").select("id, name"),
    client
      .from("doc_chunks")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (docsRes.error) throw new Error(docsRes.error.message);
  if (foldersRes.error) throw new Error(foldersRes.error.message);
  if (chunkRes.error) throw new Error(chunkRes.error.message);

  const folderName = new Map(
    (foldersRes.data ?? []).map((f) => [f.id as string, f.name as string])
  );
  const documents: MetricsDocument[] = [];
  const index: IndexFreshness = {
    documents: 0,
    notIndexed: 0,
    outdated: 0,
    lastIndexedAt: (chunkRes.data?.[0]?.created_at as string) ?? null,
  };
  for (const d of docsRes.data ?? []) {
    const folderId = d.folder_id as string | null;
    documents.push({
      id: d.id as string,
      title: (d.title as string) || "ללא כותרת",
      folderName: folderId ? folderName.get(folderId) ?? null : null,
    });
    index.documents++;
    const stored = d.content_hash as string | null;
    if (!stored) {
      index.notIndexed++;
    } else if (
      stored !== documentContentHash((d.title as string) ?? "", (d.body as string) ?? "")
    ) {
      index.outdated++;
    }
  }

  return computeDashboardMetrics({ rows, documents, index, from, to, days });
}
