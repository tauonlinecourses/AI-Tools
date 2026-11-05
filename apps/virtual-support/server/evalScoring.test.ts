import { describe, expect, it } from "vitest";
import { scoreCase, summarize, formatTally, type EvalCase } from "./evalScoring";

const answerCase: EvalCase = {
  id: "c1",
  question: "q",
  expected_outcome: "answer",
  expected_document_ids: ["doc-a"],
  note: null,
};

const refuseCase: EvalCase = {
  ...answerCase,
  id: "c2",
  expected_outcome: "refuse",
  expected_document_ids: [],
};

describe("scoreCase", () => {
  it("passes an answer case that found and cited the expected page", () => {
    expect(
      scoreCase(answerCase, {
        outcome: "answered",
        sentDocumentIds: ["doc-b", "doc-a"],
        citedDocumentIds: ["doc-a"],
      })
    ).toEqual({ search: true, outcome: true, citation: true, passed: true });
  });

  it("separates a search miss from a wrong refusal", () => {
    const miss = scoreCase(answerCase, {
      outcome: "answered",
      sentDocumentIds: ["doc-b"],
      citedDocumentIds: ["doc-b"],
    });
    expect(miss).toMatchObject({ search: false, outcome: true, citation: false, passed: false });

    const wrongRefusal = scoreCase(answerCase, {
      outcome: "refused",
      sentDocumentIds: ["doc-a"],
      citedDocumentIds: [],
    });
    expect(wrongRefusal).toMatchObject({ search: true, outcome: false, passed: false });
  });

  it("counts an uncited answer as answered but failing citation", () => {
    expect(
      scoreCase(answerCase, {
        outcome: "uncited",
        sentDocumentIds: ["doc-a"],
        citedDocumentIds: [],
      })
    ).toEqual({ search: true, outcome: true, citation: false, passed: false });
  });

  it("scores refuse cases on outcome only", () => {
    expect(
      scoreCase(refuseCase, { outcome: "no_match", sentDocumentIds: [], citedDocumentIds: [] })
    ).toEqual({ search: null, outcome: true, citation: null, passed: true });
    expect(
      scoreCase(refuseCase, {
        outcome: "answered",
        sentDocumentIds: ["doc-a"],
        citedDocumentIds: ["doc-a"],
      }).passed
    ).toBe(false);
  });

  it("skips search/citation checks when an answer case lists no pages", () => {
    const s = scoreCase(
      { ...answerCase, expected_document_ids: [] },
      { outcome: "answered", sentDocumentIds: ["x"], citedDocumentIds: ["x"] }
    );
    expect(s).toEqual({ search: null, outcome: true, citation: null, passed: true });
  });
});

describe("summarize", () => {
  it("tallies only applicable checks", () => {
    const summary = summarize([
      { search: true, outcome: true, citation: true, passed: true },
      { search: false, outcome: true, citation: false, passed: false },
      { search: null, outcome: true, citation: null, passed: true },
    ]);
    expect(summary).toEqual({
      cases: 3,
      passed: 2,
      search: { passed: 1, total: 2 },
      outcome: { passed: 3, total: 3 },
      citation: { passed: 1, total: 2 },
    });
    expect(formatTally(summary.search)).toBe("1/2");
    expect(formatTally({ passed: 0, total: 0 })).toBe("n/a");
  });
});
