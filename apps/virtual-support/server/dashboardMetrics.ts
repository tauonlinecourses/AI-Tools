/**
 * Admin dashboard aggregates (Stage A), computed from ask_log rows.
 * Pure functions only — the fetching lives in metricsHandler.ts — so the
 * maths can be unit-tested without a database.
 *
 * Days are bucketed in Israel time (Asia/Jerusalem).
 */

import { estimateCostUsd, type ModelUsage } from "./pricing.js";
import type {
  Breakdown,
  DailyPoint,
  DashboardMetrics,
  IndexFreshness,
  LatencyStage,
} from "../src/lib/dashboardTypes.js";

export type {
  Breakdown,
  DailyPoint,
  DashboardMetrics,
  IndexFreshness,
  LatencyStage,
};

export const DASHBOARD_TIME_ZONE = "Asia/Jerusalem";
/** Same rule as the ask_log_review view: next question in the chat within 2 min. */
export const REPHRASE_WINDOW_MS = 2 * 60 * 1000;
export const LATENCY_STAGES: readonly LatencyStage[] = [
  "rewrite",
  "embed",
  "search",
  "answer",
  "total",
];

export type MetricsLogRow = {
  created_at: string;
  session_id: string | null;
  pipeline_version: string;
  outcome: string;
  vote: "up" | "down" | null;
  pages_sent: Array<{ documentId: string; similarity?: number; rrf?: number }> | null;
  cited_document_ids: string[] | null;
  best_similarity: number | null;
  latency_ms: Partial<Record<LatencyStage, number>> | null;
  usage: ModelUsage[] | null;
  input_tokens: number | null;
  output_tokens: number | null;
  embed_tokens: number | null;
  /** Postgres numeric may arrive as a string. */
  cost_usd: number | string | null;
};

export type MetricsDocument = {
  id: string;
  title: string;
  folderName: string | null;
};

// ------------------------------------------------------------------ helpers

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: DASHBOARD_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** YYYY-MM-DD in Israel time. */
export function dayKey(date: Date | string): string {
  return dayFormatter.format(typeof date === "string" ? new Date(date) : date);
}

/** Every day key from `from` to `to` inclusive. */
export function dayRange(from: Date, to: Date): string[] {
  const days: string[] = [];
  const last = dayKey(to);
  // Step by 12h and dedupe so DST changes never skip a day.
  for (let t = from.getTime(); ; t += 12 * 3600 * 1000) {
    const key = dayKey(new Date(t));
    if (days[days.length - 1] !== key) days.push(key);
    if (key === last || days.length > 400) break;
  }
  return days;
}

/** Nearest-rank percentile (q in 0..1); null for an empty list. */
export function percentile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(q * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]!;
}

function rate(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

function num(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return Number.isFinite(n) ? (n as number) : 0;
}

function hasMetrics(row: MetricsLogRow): boolean {
  return row.latency_ms != null;
}

const ABSTAIN = new Set(["refused", "no_match"]);

/**
 * Indexes of rows followed by another question in the same chat within
 * REPHRASE_WINDOW_MS. Rows must be sorted by created_at ascending.
 */
export function rephrasedFlags(rows: MetricsLogRow[]): boolean[] {
  const flags = rows.map(() => false);
  const lastBySession = new Map<string, number>();
  rows.forEach((row, i) => {
    if (!row.session_id) return;
    const prev = lastBySession.get(row.session_id);
    if (prev !== undefined) {
      const gap =
        new Date(row.created_at).getTime() -
        new Date(rows[prev]!.created_at).getTime();
      if (gap > 0 && gap <= REPHRASE_WINDOW_MS) flags[prev] = true;
    }
    lastBySession.set(row.session_id, i);
  });
  return flags;
}

/** Page the answer relied on: first cited page, else best page sent. */
export function sourceDocumentId(row: MetricsLogRow): string | null {
  return row.cited_document_ids?.[0] ?? row.pages_sent?.[0]?.documentId ?? null;
}

type Acc = {
  label: string;
  questions: number;
  votes: number;
  thumbsDown: number;
  rephrased: number;
};

function toBreakdown(map: Map<string, Acc>): Breakdown[] {
  return [...map.entries()]
    .map(([key, a]) => ({
      key,
      label: a.label,
      questions: a.questions,
      votes: a.votes,
      thumbsDown: a.thumbsDown,
      thumbsDownRate: rate(a.thumbsDown, a.votes),
      rephrased: a.rephrased,
      rephraseRate: rate(a.rephrased, a.questions),
    }))
    .sort((a, b) => b.questions - a.questions);
}

// ------------------------------------------------------------------ main

export function computeDashboardMetrics(input: {
  rows: MetricsLogRow[];
  documents: MetricsDocument[];
  index: IndexFreshness;
  from: Date;
  to: Date;
  days: number;
}): DashboardMetrics {
  const rows = [...input.rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const rephrased = rephrasedFlags(rows);
  const docById = new Map(input.documents.map((d) => [d.id, d]));

  type DayAcc = {
    requests: number;
    errors: number;
    ok: number;
    noMatch: number;
    abstain: number;
    uncited: number;
    bestSim: number[];
    topRrf: number[];
    total: number[];
    votes: number;
    down: number;
    rephrased: number;
    cost: number;
    metricRows: number;
    tokensByModel: Record<string, number>;
  };
  const newDay = (): DayAcc => ({
    requests: 0, errors: 0, ok: 0, noMatch: 0, abstain: 0, uncited: 0,
    bestSim: [], topRrf: [], total: [], votes: 0, down: 0, rephrased: 0,
    cost: 0, metricRows: 0, tokensByModel: {},
  });
  const days = new Map<string, DayAcc>(
    dayRange(input.from, input.to).map((d) => [d, newDay()])
  );

  const stageValues = new Map<LatencyStage, number[]>(
    LATENCY_STAGES.map((s) => [s, []])
  );
  const stageCost = new Map<string, { costUsd: number; tokens: number }>();
  const modelCost = new Map<
    string,
    { costUsd: number; inputTokens: number; outputTokens: number }
  >();
  const releases = new Map<string, string>();
  const folders = new Map<string, Acc>();
  const documents = new Map<string, Acc>();

  const totals = {
    requests: 0, errors: 0, ok: 0, noMatch: 0, abstain: 0, withMetrics: 0,
    inputTokens: 0, outputTokens: 0, embedTokens: 0, costUsd: 0,
    votes: 0, down: 0, rephrased: 0,
  };

  rows.forEach((row, i) => {
    const day = dayKey(row.created_at);
    let d = days.get(day);
    if (!d) {
      d = newDay();
      days.set(day, d);
    }
    if (!releases.has(row.pipeline_version)) {
      releases.set(row.pipeline_version, day);
    }

    d.requests++;
    totals.requests++;
    if (row.outcome === "error") {
      d.errors++;
      totals.errors++;
    } else {
      d.ok++;
      totals.ok++;
      if (row.outcome === "no_match") {
        d.noMatch++;
        totals.noMatch++;
      }
      if (ABSTAIN.has(row.outcome)) {
        d.abstain++;
        totals.abstain++;
      }
      if (row.outcome === "uncited") d.uncited++;
      if (row.best_similarity != null) d.bestSim.push(row.best_similarity);
      const topRrf = row.pages_sent?.[0]?.rrf;
      if (typeof topRrf === "number") d.topRrf.push(topRrf);
      if (rephrased[i]) {
        d.rephrased++;
        totals.rephrased++;
      }
    }

    if (row.vote) {
      d.votes++;
      totals.votes++;
      if (row.vote === "down") {
        d.down++;
        totals.down++;
      }
    }

    if (hasMetrics(row)) {
      totals.withMetrics++;
      d.metricRows++;
      for (const stage of LATENCY_STAGES) {
        const v = row.latency_ms?.[stage];
        if (typeof v === "number") stageValues.get(stage)!.push(v);
      }
      if (typeof row.latency_ms?.total === "number") d.total.push(row.latency_ms.total);
      const cost = num(row.cost_usd);
      d.cost += cost;
      totals.costUsd += cost;
      totals.inputTokens += num(row.input_tokens);
      totals.outputTokens += num(row.output_tokens);
      totals.embedTokens += num(row.embed_tokens);
      for (const u of row.usage ?? []) {
        const tokens = u.inputTokens + u.outputTokens;
        d.tokensByModel[u.model] = (d.tokensByModel[u.model] ?? 0) + tokens;
        const uCost = estimateFromUsage(u);
        const s = stageCost.get(u.stage) ?? { costUsd: 0, tokens: 0 };
        s.costUsd += uCost;
        s.tokens += tokens;
        stageCost.set(u.stage, s);
        const m = modelCost.get(u.model) ?? { costUsd: 0, inputTokens: 0, outputTokens: 0 };
        m.costUsd += uCost;
        m.inputTokens += u.inputTokens;
        m.outputTokens += u.outputTokens;
        modelCost.set(u.model, m);
      }
    }

    // Breakdowns by the page the answer relied on (errors have no source).
    if (row.outcome !== "error") {
      const docId = sourceDocumentId(row);
      const doc = docId ? docById.get(docId) : undefined;
      const folderKey = doc ? doc.folderName ?? "__unfiled__" : "__none__";
      const folderLabel = doc
        ? doc.folderName ?? "ללא תיקייה"
        : docId
          ? "מסמך שנמחק"
          : "ללא מקור";
      bump(folders, folderKey, folderLabel, row, rephrased[i]!);
      if (docId) {
        bump(documents, docId, doc?.title ?? "מסמך שנמחק", row, rephrased[i]!);
      }
    }
  });

  const models = [...modelCost.keys()].sort();
  const daily: DailyPoint[] = [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, d]) => ({
      day,
      requests: d.requests,
      errors: d.errors,
      errorRate: rate(d.errors, d.requests),
      noMatchRate: rate(d.noMatch, d.ok),
      abstentionRate: rate(d.abstain, d.ok),
      uncitedRate: rate(d.uncited, d.ok),
      medianBestSimilarity: percentile(d.bestSim, 0.5),
      medianTopRrf: percentile(d.topRrf, 0.5),
      latencyP50: percentile(d.total, 0.5),
      latencyP95: percentile(d.total, 0.95),
      thumbsDownRate: rate(d.down, d.votes),
      votes: d.votes,
      rephraseRate: rate(d.rephrased, d.ok),
      costUsd: d.cost,
      costPerRequest: d.metricRows > 0 ? d.cost / d.metricRows : null,
      tokensByModel: d.tokensByModel,
    }));

  return {
    generatedAt: new Date().toISOString(),
    range: { days: input.days, from: input.from.toISOString(), to: input.to.toISOString() },
    totals: {
      requests: totals.requests,
      errors: totals.errors,
      withMetrics: totals.withMetrics,
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      embedTokens: totals.embedTokens,
      costUsd: totals.costUsd,
      costPerRequest: totals.withMetrics > 0 ? totals.costUsd / totals.withMetrics : null,
      errorRate: rate(totals.errors, totals.requests),
      noMatchRate: rate(totals.noMatch, totals.ok),
      abstentionRate: rate(totals.abstain, totals.ok),
      thumbsDownRate: rate(totals.down, totals.votes),
      rephraseRate: rate(totals.rephrased, totals.ok),
    },
    latency: LATENCY_STAGES.map((stage) => {
      const values = stageValues.get(stage)!;
      return {
        stage,
        p50: percentile(values, 0.5),
        p95: percentile(values, 0.95),
        n: values.length,
      };
    }),
    daily,
    models,
    costByStage: [...stageCost.entries()]
      .map(([stage, v]) => ({ stage, ...v }))
      .sort((a, b) => b.costUsd - a.costUsd),
    costByModel: models.map((model) => ({ model, ...modelCost.get(model)! })),
    releases: [...releases.entries()]
      .map(([version, day]) => ({ version, day }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    byFolder: toBreakdown(folders),
    byDocument: toBreakdown(documents).slice(0, 15),
    index: input.index,
  };
}

function bump(
  map: Map<string, Acc>,
  key: string,
  label: string,
  row: MetricsLogRow,
  wasRephrased: boolean
): void {
  const a = map.get(key) ?? { label, questions: 0, votes: 0, thumbsDown: 0, rephrased: 0 };
  a.questions++;
  if (row.vote) a.votes++;
  if (row.vote === "down") a.thumbsDown++;
  if (wasRephrased) a.rephrased++;
  map.set(key, a);
}

function estimateFromUsage(u: ModelUsage): number {
  return estimateCostUsd([u]);
}
