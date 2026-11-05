import { describe, expect, it } from "vitest";
import {
  buildContext,
  CONTEXT_SEPARATOR,
  extractKeywordTerms,
  isStrongKeywordMatch,
  rankPages,
  TRUNCATION_MARK,
  type ContextPage,
  type HybridHit,
} from "./askRetrieval";

function hit(partial: Partial<HybridHit> & { document_id: string }): HybridHit {
  return {
    id: `${partial.document_id}-${partial.chunk_index ?? 0}`,
    chunk_index: 0,
    content: "",
    similarity: 0,
    keyword_rank: 0,
    rrf_score: 0,
    ...partial,
  };
}

function page(id: string, text: string): ContextPage {
  return { documentId: id, title: `כותרת ${id}`, folderName: null, text };
}

describe("extractKeywordTerms", () => {
  it("drops stopwords and short tokens, keeps exact terms", () => {
    const q = extractKeywordTerms("איך מאפסים MFA לסטודנט? שגיאה 0x80070005");
    const originals = q.groups.map((g) => g.variants[0]);
    expect(originals).toEqual(["מאפסים", "mfa", "לסטודנט", "שגיאה", "0x80070005"]);
    expect(q.groups.find((g) => g.variants[0] === "mfa")?.distinctive).toBe(true);
    expect(q.groups.find((g) => g.variants[0] === "שגיאה")?.distinctive).toBe(false);
  });

  it("adds Hebrew prefix-stripped variants", () => {
    const q = extractKeywordTerms("והמדפסת לא מדפיסה");
    expect(q.groups[0]!.variants).toEqual(["והמדפסת", "המדפסת", "מדפסת"]);
    expect(q.text.split(" ")).toContain("מדפסת");
  });

  it("does not strip prefixes from short words or Latin words", () => {
    const q = extractKeywordTerms("ביל vpn");
    expect(q.groups[0]!.variants).toEqual(["ביל"]);
    expect(q.groups[1]!.variants).toEqual(["vpn"]);
  });

  it("splits Hebrew prefix + hyphen before a Latin term", () => {
    const originals = extractKeywordTerms("חיבור ל-VPN").groups.map((g) => g.variants[0]);
    expect(originals).toEqual(["חיבור", "ל-vpn", "vpn"]);
  });

  it("returns empty text for a stopword-only question", () => {
    expect(extractKeywordTerms("איך מה?").text).toBe("");
  });
});

describe("isStrongKeywordMatch", () => {
  const groups = extractKeywordTerms("שגיאה 0x80070005 במדפסת").groups;

  it("accepts a single distinctive term", () => {
    expect(isStrongKeywordMatch("קוד 0x80070005 מופיע", groups)).toBe(true);
  });

  it("needs two ordinary words otherwise", () => {
    expect(isStrongKeywordMatch("הודעת שגיאה כללית", groups)).toBe(false);
    expect(isStrongKeywordMatch("שגיאה של מדפסת", groups)).toBe(true);
  });
});

describe("rankPages", () => {
  const groups = extractKeywordTerms("vpn").groups;

  it("groups chunks by page and ranks by best RRF score", () => {
    const pages = rankPages(
      [
        hit({ document_id: "a", chunk_index: 0, similarity: 0.5, rrf_score: 0.01 }),
        hit({ document_id: "b", chunk_index: 0, similarity: 0.4, rrf_score: 0.03 }),
        hit({ document_id: "a", chunk_index: 1, similarity: 0.6, rrf_score: 0.02 }),
      ],
      groups,
      0.3,
      4
    );
    expect(pages.map((p) => p.documentId)).toEqual(["b", "a"]);
    expect(pages[1]!.bestHit.chunk_index).toBe(1);
    expect(pages[1]!.bestSimilarity).toBe(0.6);
  });

  it("drops low-similarity chunks unless they are strong keyword hits", () => {
    const pages = rankPages(
      [
        hit({ document_id: "weak", similarity: 0.2, rrf_score: 0.05 }),
        hit({
          document_id: "kw",
          similarity: 0.1,
          keyword_rank: 0.1,
          rrf_score: 0.02,
          content: "חיבור ל-VPN מהבית",
        }),
      ],
      groups,
      0.3,
      4
    );
    expect(pages.map((p) => p.documentId)).toEqual(["kw"]);
  });

  it("caps the number of pages", () => {
    const hits = ["a", "b", "c", "d", "e"].map((id, i) =>
      hit({ document_id: id, similarity: 0.5, rrf_score: 1 - i * 0.1 })
    );
    expect(rankPages(hits, groups, 0.3, 4)).toHaveLength(4);
  });
});

describe("buildContext", () => {
  it("includes whole pages numbered in rank order", () => {
    const { block, included } = buildContext(
      [page("a", "שלב 1\nשלב 2"), page("b", "טקסט")],
      10_000
    );
    expect(included.map((p) => p.documentId)).toEqual(["a", "b"]);
    expect(block).toBe(
      `[מסמך 1: כותרת a]\nשלב 1\nשלב 2${CONTEXT_SEPARATOR}[מסמך 2: כותרת b]\nטקסט`
    );
  });

  it("truncates the page that overflows and drops the ones after it", () => {
    const { block, included } = buildContext(
      [page("a", "א".repeat(500)), page("b", "ב".repeat(2000)), page("c", "ג")],
      1500
    );
    expect(included.map((p) => p.documentId)).toEqual(["a", "b"]);
    expect(block.length).toBeLessThanOrEqual(1500);
    expect(block.endsWith(TRUNCATION_MARK)).toBe(true);
    expect(block).not.toContain("ג");
  });

  it("skips a truncated page when too little room is left", () => {
    const { included } = buildContext(
      [page("a", "א".repeat(900)), page("b", "ב".repeat(2000))],
      1000
    );
    expect(included.map((p) => p.documentId)).toEqual(["a"]);
  });

  it("falls back to the title for an empty body", () => {
    const { block } = buildContext([page("a", "  ")], 1000);
    expect(block).toBe("[מסמך 1: כותרת a]\nכותרת a");
  });
});
