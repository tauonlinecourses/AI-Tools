import { describe, expect, it } from "vitest";
import {
  computeDashboardMetrics,
  dayKey,
  dayRange,
  percentile,
  rephrasedFlags,
  type MetricsLogRow,
} from "./dashboardMetrics";
import { estimateCostUsd } from "./pricing";
import { newTrace, traceColumns } from "./askHandler";

function row(over: Partial<MetricsLogRow>): MetricsLogRow {
  return {
    created_at: "2026-11-05T10:00:00Z",
    session_id: null,
    pipeline_version: "v1",
    outcome: "answered",
    vote: null,
    pages_sent: [],
    cited_document_ids: [],
    best_similarity: null,
    latency_ms: null,
    usage: null,
    input_tokens: null,
    output_tokens: null,
    embed_tokens: null,
    cost_usd: null,
    ...over,
  };
}

const index = { documents: 0, notIndexed: 0, outdated: 0, lastIndexedAt: null };

describe("percentile", () => {
  it("uses nearest rank", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(values, 0.5)).toBe(5);
    expect(percentile(values, 0.95)).toBe(10);
    expect(percentile([], 0.5)).toBeNull();
  });
});

describe("days", () => {
  it("buckets in Israel time", () => {
    // 23:30 UTC on Nov 5 is already Nov 6 in Israel (UTC+2).
    expect(dayKey("2026-11-05T23:30:00Z")).toBe("2026-11-06");
  });
  it("lists each day once", () => {
    const days = dayRange(new Date("2026-11-01T00:00:00Z"), new Date("2026-11-07T12:00:00Z"));
    expect(days[0]).toBe("2026-11-01");
    expect(days[days.length - 1]).toBe("2026-11-07");
    expect(new Set(days).size).toBe(days.length);
    expect(days).toHaveLength(7);
  });
});

describe("rephrasedFlags", () => {
  it("flags a question followed within 2 minutes in the same chat", () => {
    const rows = [
      row({ session_id: "a", created_at: "2026-11-05T10:00:00Z" }),
      row({ session_id: "b", created_at: "2026-11-05T10:00:30Z" }),
      row({ session_id: "a", created_at: "2026-11-05T10:01:00Z" }),
      row({ session_id: "a", created_at: "2026-11-05T10:10:00Z" }),
    ];
    expect(rephrasedFlags(rows)).toEqual([true, false, false, false]);
  });
});

describe("pricing", () => {
  it("estimates cost from tokens", () => {
    expect(
      estimateCostUsd([
        { stage: "answer", model: "gpt-4o", inputTokens: 1_000_000, outputTokens: 100_000 },
        { stage: "embed", model: "text-embedding-3-small", inputTokens: 1_000_000, outputTokens: 0 },
        { stage: "x", model: "unknown", inputTokens: 5, outputTokens: 5 },
      ])
    ).toBeCloseTo(2.5 + 1 + 0.02, 6);
  });

  it("splits chat and embedding tokens in traceColumns", () => {
    const trace = newTrace();
    trace.latencyMs = { embed: 100, search: 50, answer: 900 };
    trace.usage = [
      { stage: "embed", model: "text-embedding-3-small", inputTokens: 12, outputTokens: 0 },
      { stage: "answer", model: "gpt-4o", inputTokens: 3000, outputTokens: 200 },
    ];
    const cols = traceColumns(trace, 1100);
    expect(cols.latency_ms).toEqual({ embed: 100, search: 50, answer: 900, total: 1100 });
    expect(cols.input_tokens).toBe(3000);
    expect(cols.output_tokens).toBe(200);
    expect(cols.embed_tokens).toBe(12);
    expect(cols.cost_usd).toBeGreaterThan(0);
  });
});

describe("computeDashboardMetrics", () => {
  const from = new Date("2026-11-04T00:00:00Z");
  const to = new Date("2026-11-05T12:00:00Z");
  const documents = [
    { id: "d1", title: "VPN", folderName: "רשת" },
    { id: "d2", title: "מדפסת", folderName: null },
  ];
  const rows = [
    row({
      created_at: "2026-11-04T08:00:00Z",
      pipeline_version: "v1",
      cited_document_ids: ["d1"],
      vote: "down",
      session_id: "s",
      latency_ms: { embed: 100, answer: 1000, total: 1200 },
      usage: [{ stage: "answer", model: "gpt-4o", inputTokens: 1000, outputTokens: 100 }],
      input_tokens: 1000,
      output_tokens: 100,
      embed_tokens: 0,
      cost_usd: "0.0035",
      pages_sent: [{ documentId: "d1", rrf: 0.03, similarity: 0.5 }],
      best_similarity: 0.5,
    }),
    row({ created_at: "2026-11-04T08:01:00Z", session_id: "s", outcome: "no_match", vote: "up" }),
    row({ created_at: "2026-11-05T08:00:00Z", pipeline_version: "v2", outcome: "error" }),
    row({
      created_at: "2026-11-05T09:00:00Z",
      pipeline_version: "v2",
      outcome: "refused",
      pages_sent: [{ documentId: "d2", rrf: 0.02 }],
    }),
  ];
  const m = computeDashboardMetrics({ rows, documents, index, from, to, days: 2 });

  it("computes totals and rates", () => {
    expect(m.totals.requests).toBe(4);
    expect(m.totals.errors).toBe(1);
    expect(m.totals.errorRate).toBeCloseTo(0.25);
    expect(m.totals.noMatchRate).toBeCloseTo(1 / 3);
    expect(m.totals.abstentionRate).toBeCloseTo(2 / 3);
    expect(m.totals.thumbsDownRate).toBeCloseTo(0.5);
    expect(m.totals.rephraseRate).toBeCloseTo(1 / 3);
    expect(m.totals.withMetrics).toBe(1);
    expect(m.totals.costUsd).toBeCloseTo(0.0035);
    expect(m.totals.costPerRequest).toBeCloseTo(0.0035);
  });

  it("fills every day and marks releases", () => {
    expect(m.daily.map((d) => d.day)).toEqual(["2026-11-04", "2026-11-05"]);
    expect(m.daily[0]!.tokensByModel).toEqual({ "gpt-4o": 1100 });
    expect(m.releases).toEqual([
      { version: "v1", day: "2026-11-04" },
      { version: "v2", day: "2026-11-05" },
    ]);
  });

  it("only uses measured rows for latency", () => {
    const total = m.latency.find((l) => l.stage === "total")!;
    expect(total).toMatchObject({ p50: 1200, p95: 1200, n: 1 });
    expect(m.latency.find((l) => l.stage === "rewrite")!.n).toBe(0);
  });

  it("breaks feedback down by source folder", () => {
    const network = m.byFolder.find((b) => b.label === "רשת")!;
    expect(network).toMatchObject({ questions: 1, votes: 1, thumbsDown: 1, rephrased: 1 });
    expect(m.byFolder.find((b) => b.label === "ללא תיקייה")!.questions).toBe(1);
    expect(m.byFolder.find((b) => b.label === "ללא מקור")!.questions).toBe(1);
    expect(m.byDocument.map((b) => b.key).sort()).toEqual(["d1", "d2"]);
  });
});
