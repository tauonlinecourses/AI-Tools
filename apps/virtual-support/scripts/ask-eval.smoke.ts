/**
 * Re-test the Ask pipeline against the cases in `ask_eval_cases`.
 *
 *   pnpm --filter virtual-support eval
 *
 * Runs every active case through the real pipeline (dev Supabase + OpenAI,
 * no ask_log rows written) and checks:
 *   search   — an expected page was among the pages sent to the model
 *   outcome  — answered vs refused as expected
 *   citation — an expected page was cited
 * Prints one line per case, a summary, and failure details; writes a JSON
 * report to eval-results/ (git-ignored) for before/after comparison.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createVsServiceClient } from "../server/vsSupabase";
import { askDetailed, PIPELINE_VERSION } from "../server/askHandler";
import {
  formatTally,
  scoreCase,
  summarize,
  type CaseScore,
  type EvalCase,
} from "../server/evalScoring";

const mark = (v: boolean | null) => (v === null ? "·" : v ? "✓" : "✗");

describe("ask eval", () => {
  it("runs all active eval cases", async () => {
    const client = createVsServiceClient();
    const { data, error } = await client
      .from("ask_eval_cases")
      .select("id, question, expected_outcome, expected_document_ids, note")
      .eq("active", true)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const cases = (data ?? []) as EvalCase[];
    expect(cases.length, "no active rows in ask_eval_cases").toBeGreaterThan(0);

    const { data: docs } = await client.from("documents").select("id, title");
    const titleById = new Map((docs ?? []).map((d) => [d.id as string, d.title as string]));
    const title = (id: string) => titleById.get(id) ?? `(missing page ${id.slice(0, 8)})`;

    const rows: Array<{
      case: EvalCase;
      score: CaseScore;
      outcome: string;
      answer: string;
      pagesSent: Array<{ title: string; similarity: number }>;
      cited: string[];
    }> = [];

    console.log(`\nPipeline ${PIPELINE_VERSION} — ${cases.length} cases`);
    console.log("search outcome citation | result   | question");
    for (const c of cases) {
      const d = await askDetailed({ question: c.question });
      const cited = d.result.cited ? d.result.sources.map((s) => s.documentId) : [];
      const score = scoreCase(c, {
        outcome: d.outcome,
        sentDocumentIds: d.pagesSent.map((p) => p.documentId),
        citedDocumentIds: cited,
      });
      rows.push({
        case: c,
        score,
        outcome: d.outcome,
        answer: d.result.answer,
        pagesSent: d.pagesSent.map((p) => ({ title: p.title, similarity: p.similarity })),
        cited: cited.map(title),
      });
      console.log(
        `  ${mark(score.search)}      ${mark(score.outcome)}       ${mark(score.citation)}    | ${d.outcome.padEnd(8)} | ${c.question}`
      );
    }

    const summary = summarize(rows.map((r) => r.score));
    console.log(
      `\nSUMMARY  passed ${summary.passed}/${summary.cases} · search ${formatTally(summary.search)} · outcome ${formatTally(summary.outcome)} · citation ${formatTally(summary.citation)}`
    );

    const failures = rows.filter((r) => !r.score.passed);
    for (const f of failures) {
      console.log(`\n✗ ${f.case.question}`);
      console.log(
        `  expected: ${f.case.expected_outcome}${
          f.case.expected_document_ids.length
            ? ` → ${f.case.expected_document_ids.map(title).join(" | ")}`
            : ""
        }${f.case.note ? `  (${f.case.note})` : ""}`
      );
      console.log(`  got: ${f.outcome}`);
      console.log(
        `  pages sent: ${
          f.pagesSent.map((p) => `${p.title} (${p.similarity.toFixed(2)})`).join(" | ") || "none"
        }`
      );
      console.log(`  cited: ${f.cited.join(" | ") || "none"}`);
      console.log(`  answer: ${f.answer.replace(/\s+/g, " ").slice(0, 200)}`);
    }

    const dir = join(__dirname, "..", "eval-results");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    writeFileSync(
      file,
      JSON.stringify({ pipelineVersion: PIPELINE_VERSION, ranAt: new Date().toISOString(), summary, rows }, null, 2),
      "utf8"
    );
    console.log(`\nReport: ${file}`);
  });
});
