/**
 * Scoring for the Ask re-test set (pure, unit-tested).
 * A check is `null` when it does not apply (e.g. no search check for a
 * case that expects a refusal).
 */

import type { AskOutcome } from "./askHandler.js";

export type EvalCase = {
  id: string;
  question: string;
  expected_outcome: "answer" | "refuse";
  expected_document_ids: string[];
  note: string | null;
};

export type EvalObservation = {
  outcome: AskOutcome;
  /** Document ids sent to the model, in rank order. */
  sentDocumentIds: string[];
  /** Document ids cited in the answer (empty unless cited). */
  citedDocumentIds: string[];
};

export type CaseScore = {
  /** An expected page was among the pages sent to the model. */
  search: boolean | null;
  /** Answered vs refused as expected. */
  outcome: boolean;
  /** An expected page was cited in the answer. */
  citation: boolean | null;
  passed: boolean;
};

export function scoreCase(c: EvalCase, obs: EvalObservation): CaseScore {
  if (c.expected_outcome === "refuse") {
    const outcome = obs.outcome === "refused" || obs.outcome === "no_match";
    return { search: null, outcome, citation: null, passed: outcome };
  }

  const expected = new Set(c.expected_document_ids);
  const hasExpected = expected.size > 0;
  const outcome = obs.outcome === "answered" || obs.outcome === "uncited";
  const search = hasExpected
    ? obs.sentDocumentIds.some((id) => expected.has(id))
    : null;
  const citation = hasExpected
    ? obs.citedDocumentIds.some((id) => expected.has(id))
    : null;
  const passed = outcome && search !== false && citation !== false;
  return { search, outcome, citation, passed };
}

export type CheckTally = { passed: number; total: number };

export type EvalSummary = {
  cases: number;
  passed: number;
  search: CheckTally;
  outcome: CheckTally;
  citation: CheckTally;
};

export function summarize(scores: CaseScore[]): EvalSummary {
  const tally = (pick: (s: CaseScore) => boolean | null): CheckTally => {
    const applicable = scores.map(pick).filter((v): v is boolean => v !== null);
    return {
      passed: applicable.filter(Boolean).length,
      total: applicable.length,
    };
  };
  return {
    cases: scores.length,
    passed: scores.filter((s) => s.passed).length,
    search: tally((s) => s.search),
    outcome: tally((s) => s.outcome),
    citation: tally((s) => s.citation),
  };
}

export function formatTally(t: CheckTally): string {
  return t.total === 0 ? "n/a" : `${t.passed}/${t.total}`;
}
