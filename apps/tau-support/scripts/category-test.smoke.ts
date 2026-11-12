/**
 * Test per-question category sorting on a sample (e.g. after a prompt change).
 *
 *   pnpm --filter tau-support category-test
 *
 * Read-only: reads the saved dashboard snapshot and question embeddings from
 * Supabase and writes nothing back. Sorts a seeded sample three ways:
 *   current   — the category saved in the dashboard snapshot
 *   mini      — gpt-4o-mini, one answer per question, same prompt as production
 *   embedding — closest CATEGORY_DESCRIPTIONS entry, no chat model
 * Writes a CSV (to label) and a summary to category-test-results/ (git-ignored:
 * it holds student post text). Score labels with `category-test:score`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { describe, it } from "vitest";
import { CATEGORY_COLORS } from "../src/lib/categoryColors";
import {
  DASHBOARD_FORMAT_VERSION,
  type DashboardSnapshot,
} from "../src/lib/dashboardTypes";
import {
  isNoIssueReply,
  isNonWordComment,
  isSelfIntroduction,
  parseIndexedAnswers,
  seededRandom,
  shortenAndNormalize,
  toFixedCategory,
} from "../src/lib/questionClustering";
import { QUESTION_CATEGORY_PROMPT } from "../server/questionDashboard";
import {
  CATEGORY_DESCRIPTIONS,
  distribution,
  rowsFromCsv,
  share,
  toCsv,
  type TestRow,
} from "./categoryTestShared";

const SAMPLE_SIZE = Number(process.env.CATEGORY_TEST_SIZE) || 200;
const SAMPLE_SEED = 7;
const BATCH_SIZE = 40;
const CHAT_MODEL = "gpt-4o-mini";
const EMBED_MODEL = "text-embedding-3-small";
const STORED_DIMS = 256;
const FALLBACK_CATEGORY = "אחר";
const UNSORTED = "(לא ממוין)";
/** USD per million tokens, list prices as remembered; not checked at run time. */
const PRICE = { miniIn: 0.15, miniOut: 0.6, embed: 0.02 };
const FIXED_CATEGORIES = Object.keys(CATEGORY_COLORS);

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} in apps/tau-support/.env`);
  return value;
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const random = seededRandom(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let d = 0; d < a.length; d += 1) sum += a[d]! * b[d]!;
  return sum;
}

describe("category test", () => {
  it("sorts a sample three ways", async () => {
    const db = createClient(
      env("VITE_SUPABASE_URL"),
      env("TAU_SUPABASE_SERVICE_ROLE_KEY")
    );
    const openai = new OpenAI({ apiKey: env("OPENAI_API_KEY") });

    const { data: snapshotRow, error: snapshotError } = await db
      .from("question_dashboard_snapshot")
      .select("payload")
      .eq("id", "singleton")
      .maybeSingle();
    if (snapshotError) throw snapshotError;
    const snapshot = snapshotRow?.payload as DashboardSnapshot | undefined;
    if (!snapshot) throw new Error("No saved dashboard snapshot yet.");
    if (snapshot.formatVersion !== DASHBOARD_FORMAT_VERSION) {
      throw new Error("Saved snapshot is an old format: click מיון שאלות חדשות first.");
    }

    // Rule-based posts ("אין בעיות", no content, self-intro) never use AI.
    // Title + snippet stand in for the full body; the rules only match short posts.
    const candidates = snapshot.points.filter(
      (p) =>
        !isNoIssueReply(p.title, p.snippet ?? "") &&
        !isNonWordComment(p.title, p.snippet ?? "") &&
        !isSelfIntroduction(p.title)
    );
    const sample = seededShuffle(candidates, SAMPLE_SEED).slice(0, SAMPLE_SIZE);

    // --- gpt-4o-mini, same prompt and input format as production ---
    const miniByThread = new Map<string, string>();
    let tokensIn = 0;
    let tokensOut = 0;
    let failedBatches = 0;
    for (let i = 0; i < sample.length; i += BATCH_SIZE) {
      const batch = sample.slice(i, i + BATCH_SIZE);
      try {
        const res = await openai.chat.completions.create({
          model: CHAT_MODEL,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: QUESTION_CATEGORY_PROMPT },
            {
              role: "user",
              content: batch
                .map((p, idx) => `${idx}: ${p.title} — ${p.snippet ?? ""}`)
                .join("\n"),
            },
          ],
        });
        tokensIn += res.usage?.prompt_tokens ?? 0;
        tokensOut += res.usage?.completion_tokens ?? 0;
        const answers = parseIndexedAnswers(res.choices[0]?.message.content ?? "");
        batch.forEach((p, idx) => {
          const name = answers.get(idx);
          if (name !== undefined) {
            miniByThread.set(
              p.threadId,
              toFixedCategory(name, FIXED_CATEGORIES, FALLBACK_CATEGORY)
            );
          }
        });
      } catch (err) {
        failedBatches += 1;
        console.warn(`mini batch ${i / BATCH_SIZE} failed:`, err);
      }
    }

    // --- embeddings only: nearest category description ---
    const categories = Object.keys(CATEGORY_DESCRIPTIONS);
    const embedRes = await openai.embeddings.create({
      model: EMBED_MODEL,
      input: categories.map((c) => CATEGORY_DESCRIPTIONS[c]!),
    });
    const embedTokens = embedRes.usage?.total_tokens ?? 0;
    const categoryVectors = embedRes.data.map((d) =>
      shortenAndNormalize(d.embedding, STORED_DIMS)
    );

    const vectorByThread = new Map<string, number[]>();
    const ids = sample.map((p) => p.threadId);
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await db
        .from("question_embeddings")
        .select("thread_id, embedding")
        .in("thread_id", ids.slice(i, i + 100));
      if (error) throw error;
      for (const row of (data ?? []) as {
        thread_id: string;
        embedding: string | number[];
      }[]) {
        vectorByThread.set(
          row.thread_id,
          typeof row.embedding === "string"
            ? (JSON.parse(row.embedding) as number[])
            : row.embedding
        );
      }
    }

    const rows: TestRow[] = sample.map((p) => {
      const vector = vectorByThread.get(p.threadId);
      let embedding = UNSORTED;
      let best = 0;
      let second = 0;
      if (vector) {
        const scores = categoryVectors
          .map((cv, idx) => ({ idx, score: dot(vector, cv) }))
          .sort((a, b) => b.score - a.score);
        embedding = categories[scores[0]!.idx]!;
        best = scores[0]!.score;
        second = scores[1]?.score ?? 0;
      }
      return {
        threadId: p.threadId,
        title: p.title,
        snippet: p.snippet ?? "",
        current: p.category,
        mini: miniByThread.get(p.threadId) ?? UNSORTED,
        embedding,
        embeddingScore: best,
        embeddingMargin: best - second,
        correct: "",
      };
    });

    // Carry labels over from an earlier labeled CSV (same seed = same sample).
    const labelsFile = process.env.CATEGORY_TEST_LABELS;
    if (labelsFile) {
      const labels = new Map(
        rowsFromCsv(readFileSync(labelsFile, "utf8"))
          .filter((r) => r.correct)
          .map((r) => [r.threadId, r.correct])
      );
      for (const row of rows) row.correct = labels.get(row.threadId) ?? "";
      console.log(`Carried over ${rows.filter((r) => r.correct).length} labels`);
    }

    // Disagreements first: those are the rows most worth labeling.
    const disagreement = (r: TestRow) =>
      new Set([r.current, r.mini, r.embedding]).size;
    rows.sort((a, b) => disagreement(b) - disagreement(a));

    const cost =
      (tokensIn * PRICE.miniIn + tokensOut * PRICE.miniOut + embedTokens * PRICE.embed) /
      1_000_000;
    const allAgree = rows.filter((r) => disagreement(r) === 1).length;
    const agree = (x: keyof TestRow, y: keyof TestRow) =>
      share(rows.filter((r) => r[x] === r[y]).length, rows.length);
    const table = (pick: (r: TestRow) => string) =>
      distribution(rows, pick)
        .map(([name, n]) => `  ${name}: ${n}`)
        .join("\n");

    const summary = [
      `Category test — ${new Date().toISOString()}`,
      `Snapshot computed: ${snapshot.computedAt}`,
      `Sample: ${rows.length} of ${candidates.length} non-rule-based questions (seed ${SAMPLE_SEED})`,
      `Mini batches failed: ${failedBatches}`,
      "",
      "Agreement",
      `  all three agree:     ${share(allAgree, rows.length)}`,
      `  current = mini:      ${agree("current", "mini")}`,
      `  current = embedding: ${agree("current", "embedding")}`,
      `  mini = embedding:    ${agree("mini", "embedding")}`,
      "",
      "Current (dashboard today)",
      table((r) => r.current),
      "",
      "gpt-4o-mini",
      table((r) => r.mini),
      "",
      "Embeddings only",
      table((r) => r.embedding),
      "",
      `Tokens: mini ${tokensIn} in / ${tokensOut} out; embeddings ${embedTokens}`,
      `Estimated cost: $${cost.toFixed(4)} (assumed prices: mini $${PRICE.miniIn}/$${PRICE.miniOut} per 1M, embeddings $${PRICE.embed} per 1M)`,
      `Rough full-run estimate for ${candidates.length} questions with mini: $${(
        (cost * candidates.length) /
        Math.max(1, rows.length)
      ).toFixed(3)}`,
    ].join("\n");

    const outDir = join(__dirname, "..", "category-test-results");
    mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    writeFileSync(join(outDir, `category-test-${stamp}.csv`), toCsv(rows), "utf8");
    writeFileSync(join(outDir, `category-test-${stamp}.txt`), summary, "utf8");
    console.log(summary);
    console.log(`\nFiles written to ${outDir}`);
  });
});
