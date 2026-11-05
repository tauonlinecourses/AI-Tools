/**
 * Citation post-processing for Ask answers (pure, unit-tested).
 *
 * The model is asked to end each sentence/step with `[n]`, where n is the
 * page number in the context. Here we:
 *   1. normalize variants (`[1, 2]`, `[מסמך 1]`, `[מסמך 1: title]`) to `[1][2]`;
 *   2. drop markers that point to pages that were not sent;
 *   3. renumber cited pages by first appearance, so `[1]` is always the first
 *      cited page (the one the UI opens automatically).
 */

/** Exact sentence the model must reply with when the pages do not cover the question. */
export const REFUSAL_SENTENCE =
  "אין במאגר הידע מספיק מידע כדי לענות על השאלה הזו.";

/** Rewrite citation variants into plain `[n]` markers. */
export function normalizeCitations(text: string): string {
  return (
    text
      // [מסמך 1: some title] → [1]
      .replace(/\[\s*מסמך\s*(\d+)\s*:[^\]\n]*\]/g, "[$1]")
      // [1, 2] / [מסמך 1, מסמך 2] / [1،2] → [1][2]
      .replace(
        /\[\s*(?:מסמך\s*)?\d+(?:\s*[,،]\s*(?:מסמך\s*)?\d+)*\s*\]/g,
        (m) =>
          (m.match(/\d+/g) ?? []).map((n) => `[${n}]`).join("")
      )
  );
}

/** Remove all `[n]` markers (e.g. from chat history sent back to the model). */
export function stripCitationMarkers(text: string): string {
  return normalizeCitations(text)
    .replace(/[ \t]*\[\d+\]/g, "")
    .trim();
}

/**
 * true only when the answer is essentially just the refusal sentence.
 * A partial answer that also mentions what is missing is not a refusal and
 * keeps its sources.
 */
export function isRefusal(answer: string): boolean {
  const core = REFUSAL_SENTENCE.replace(/[.\s]+$/, "");
  const text = stripCitationMarkers(answer).replace(/^["'\s]+|["'.\s]+$/g, "");
  return text.includes(core) && text.length <= core.length + 20;
}

export type CitationResult = {
  /** Answer with validated, renumbered markers. */
  text: string;
  /** Original 1-based page numbers, in new-number order (new [1] = order[0]). */
  order: number[];
};

export function processCitations(
  answer: string,
  pageCount: number
): CitationResult {
  const order: number[] = [];
  const newNumber = new Map<number, number>();

  const renumbered = normalizeCitations(answer).replace(
    /[ \t]*\[(\d+)\]/g,
    (match, raw: string) => {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > pageCount) return "";
      let mapped = newNumber.get(n);
      if (mapped === undefined) {
        order.push(n);
        mapped = order.length;
        newNumber.set(n, mapped);
      }
      return match.replace(/\[\d+\]/, `[${mapped}]`);
    }
  );

  // Collapse repeated markers such as [1][1] → [1].
  const text = renumbered
    .replace(/(\[\d+\])(?:\s*\1)+/g, "$1")
    .trim();

  return { text, order };
}
