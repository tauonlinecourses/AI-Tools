/**
 * Ask smoke test against the dev knowledge base (real Supabase + OpenAI).
 *
 *   pnpm --filter virtual-support smoke                 # retrieval only
 *   SMOKE_ANSWER=1 pnpm --filter virtual-support smoke  # also call gpt-4o
 *
 * Questions are generated from existing pages so the check works on any
 * content: a title question, an exact-term question (a Latin/number word
 * taken from a page), a follow-up, and an off-topic question that should
 * be refused.
 */
import { describe, expect, it } from "vitest";
import { createVsServiceClient } from "../server/vsSupabase";
import { retrieve, rewriteQuestion, runAsk } from "../server/askHandler";
import { tokenize } from "../server/askRetrieval";

type Doc = { id: string; title: string };

async function loadSample(): Promise<{ docs: Doc[]; chunkCount: number; exact?: { term: string; docId: string } }> {
  const client = createVsServiceClient();
  const { data: docs, error } = await client
    .from("documents")
    .select("id, title")
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);

  const { count, error: countErr } = await client
    .from("doc_chunks")
    .select("id", { count: "exact", head: true });
  if (countErr) throw new Error(countErr.message);

  const { data: chunks, error: chunkErr } = await client
    .from("doc_chunks")
    .select("document_id, content")
    .limit(200);
  if (chunkErr) throw new Error(chunkErr.message);

  let exact: { term: string; docId: string } | undefined;
  for (const c of chunks ?? []) {
    const term = tokenize(c.content as string).find(
      (t) => /[a-z0-9]/.test(t) && t.length >= 3 && !t.includes("-")
    );
    if (term) {
      exact = { term, docId: c.document_id as string };
      break;
    }
  }
  return { docs: (docs ?? []) as Doc[], chunkCount: count ?? 0, exact };
}

function report(label: string, r: Awaited<ReturnType<typeof retrieve>>) {
  console.log(`\n=== ${label} ===`);
  console.log(`search query : ${r.searchQuery}`);
  console.log(`keyword terms: ${r.keywordText || "(none)"}`);
  console.log(`chunk hits   : ${r.hits.length}`);
  if (r.pages.length === 0) console.log("pages        : (none → refusal)");
  r.pages.forEach((p, i) =>
    console.log(
      `  [${i + 1}] ${p.title}  sim=${p.bestSimilarity.toFixed(3)}  rrf=${p.bestRrf.toFixed(4)}  kw=${p.bestHit.keyword_rank.toFixed(3)}  chars=${p.text.length}`
    )
  );
}

describe("ask smoke (dev data)", () => {
  it("retrieves, rewrites follow-ups, and refuses off-topic", async () => {
    const { docs, chunkCount, exact } = await loadSample();
    console.log(`documents (sampled): ${docs.length}, chunks: ${chunkCount}`);
    expect(docs.length, "dev knowledge base has no documents").toBeGreaterThan(0);

    // 1. Title question → that page should be among the results.
    const target = docs[0]!;
    const titleQ = `איך ${target.title}?`;
    const r1 = await retrieve(titleQ);
    report(`title question: ${titleQ}`, r1);
    expect(r1.pages.map((p) => p.documentId)).toContain(target.id);

    // 2. Exact-term question (keyword search path).
    if (exact) {
      const r2 = await retrieve(`מה זה ${exact.term}?`);
      report(`exact term: ${exact.term}`, r2);
      console.log(`  expected page found: ${r2.pages.some((p) => p.documentId === exact.docId)}`);
    } else {
      console.log("\n(no Latin/number term found in sampled chunks — exact-term check skipped)");
    }

    // 3. Follow-up rewrite.
    const history = [
      { role: "user" as const, content: titleQ },
      { role: "assistant" as const, content: `לפי המסמך "${target.title}", יש לבצע את השלבים המתוארים.` },
    ];
    const followUp = "ואם זה לא עובד?";
    const rewritten = await rewriteQuestion(followUp, history);
    console.log(`\nfollow-up "${followUp}" → "${rewritten}"`);
    report("follow-up (rewritten)", await retrieve(rewritten));

    // 4. Off-topic question → expect no pages.
    const r4 = await retrieve("מה המתכון הכי טוב לעוגת שוקולד?");
    report("off-topic", r4);

    // 5. Optional full answer.
    if (process.env.SMOKE_ANSWER === "1") {
      const res = await runAsk({ question: titleQ, log: false });
      console.log(
        `\n=== full answer (cited=${res.cited}) ===\n${res.answer}\nsources: ${res.sources
          .map((s, i) => `[${i + 1}] ${s.title}`)
          .join(" | ")}`
      );
      // Every [n] must point at a returned source.
      for (const m of res.answer.matchAll(/\[(\d+)\]/g)) {
        expect(Number(m[1])).toBeLessThanOrEqual(res.sources.length);
      }

      const off = await runAsk({ question: "מה המתכון הכי טוב לעוגת שוקולד?", log: false });
      console.log(`\n=== off-topic answer (cited=${off.cited}) ===\n${off.answer}`);
      expect(off.sources).toHaveLength(0);
    }
  });
});
