/**
 * Admin dashboard response shape, shared by the browser and
 * server/dashboardMetrics.ts. Types only (no runtime code) so both sides
 * can import it.
 */

export type LatencyStage = "rewrite" | "embed" | "search" | "answer" | "total";

export type IndexFreshness = {
  documents: number;
  /** content_hash is null: never indexed successfully. */
  notIndexed: number;
  /** Title/body changed since the last successful index. */
  outdated: number;
  /** Newest doc_chunks.created_at, ISO string. */
  lastIndexedAt: string | null;
};

export type Breakdown = {
  key: string;
  label: string;
  questions: number;
  votes: number;
  thumbsDown: number;
  /** thumbsDown / votes; null when nobody voted. */
  thumbsDownRate: number | null;
  rephrased: number;
  rephraseRate: number | null;
};

export type DailyPoint = {
  day: string;
  requests: number;
  errors: number;
  errorRate: number | null;
  noMatchRate: number | null;
  abstentionRate: number | null;
  uncitedRate: number | null;
  medianBestSimilarity: number | null;
  medianTopRrf: number | null;
  latencyP50: number | null;
  latencyP95: number | null;
  thumbsDownRate: number | null;
  votes: number;
  rephraseRate: number | null;
  costUsd: number;
  costPerRequest: number | null;
  /** model → total tokens (input + output) that day. */
  tokensByModel: Record<string, number>;
};

export type DashboardMetrics = {
  generatedAt: string;
  range: { days: number; from: string; to: string };
  totals: {
    requests: number;
    errors: number;
    /** Rows logged after migration 004 (have latency / tokens / cost). */
    withMetrics: number;
    inputTokens: number;
    outputTokens: number;
    embedTokens: number;
    costUsd: number;
    costPerRequest: number | null;
    errorRate: number | null;
    noMatchRate: number | null;
    abstentionRate: number | null;
    thumbsDownRate: number | null;
    rephraseRate: number | null;
  };
  latency: Array<{ stage: LatencyStage; p50: number | null; p95: number | null; n: number }>;
  daily: DailyPoint[];
  models: string[];
  costByStage: Array<{ stage: string; costUsd: number; tokens: number }>;
  costByModel: Array<{ model: string; costUsd: number; inputTokens: number; outputTokens: number }>;
  /** First day each pipeline version appears in the range (release markers). */
  releases: Array<{ version: string; day: string }>;
  byFolder: Breakdown[];
  byDocument: Breakdown[];
  index: IndexFreshness;
};
