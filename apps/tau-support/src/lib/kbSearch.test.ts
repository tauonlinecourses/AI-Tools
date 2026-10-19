import { describe, expect, it, vi } from "vitest";

vi.mock("./supabase.js", () => ({ isSupabaseConfigured: false, supabase: null }));
vi.mock("./embedClient.js", () => ({ embedTexts: vi.fn() }));
vi.mock("./rewriteRetrievalQuery.js", () => ({ rewriteQuestionForRetrieval: vi.fn() }));

import {
  INFO_DOC_RANK_MULTIPLIER,
  RECENCY_HALF_LIFE_DAYS,
  buildRetrievalQueries,
  rankingScore,
  recencyAdjustedScore,
} from "./kbSearch";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-06-01T00:00:00.000Z");

describe("recencyAdjustedScore", () => {
  it("keeps the full score for an answer from right now", () => {
    expect(recencyAdjustedScore(0.8, new Date(NOW).toISOString(), NOW)).toBeCloseTo(0.8);
  });

  it("decays by a factor of e after one half-life constant", () => {
    const old = new Date(NOW - RECENCY_HALF_LIFE_DAYS * DAY_MS).toISOString();
    expect(recencyAdjustedScore(1, old, NOW)).toBeCloseTo(Math.exp(-1));
  });

  it("treats missing or invalid dates as very old", () => {
    expect(recencyAdjustedScore(1, null, NOW)).toBeLessThan(1e-6);
    expect(recencyAdjustedScore(1, "not a date", NOW)).toBeLessThan(1e-6);
  });
});

describe("rankingScore", () => {
  it("boosts info docs without recency decay", () => {
    const score = rankingScore({ similarity: 0.5, answeredAt: null, sourceType: "info_doc" }, NOW);
    expect(score).toBeCloseTo(0.5 * INFO_DOC_RANK_MULTIPLIER);
  });

  it("applies recency decay to forum Q/A pairs", () => {
    const score = rankingScore({ similarity: 0.5, answeredAt: null, sourceType: "qa_pair" }, NOW);
    expect(score).toBeLessThan(1e-6);
  });
});

describe("buildRetrievalQueries", () => {
  it("returns nothing for blank input", () => {
    expect(buildRetrievalQueries("   ")).toEqual([]);
  });

  it("puts the AI rewrite first and de-duplicates", () => {
    const queries = buildRetrievalQueries("how do I reset my password", {
      aiRewritten: "how do I reset my password",
    });
    expect(queries).toEqual(["how do I reset my password"]);
  });

  it("trims trailing thanks but keeps the original as a fallback", () => {
    const queries = buildRetrievalQueries("איך מאפסים סיסמה תודה רבה");
    expect(queries[0]).toBe("איך מאפסים סיסמה");
    expect(queries).toContain("איך מאפסים סיסמה תודה רבה");
  });
});
