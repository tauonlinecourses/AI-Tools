/**
 * Pure helpers for the question dashboard: vector prep for the 3D map,
 * rule checks for posts that are not questions, and model output parsing.
 * No I/O, so they can be unit-tested.
 */

/** OpenAI's text-embedding-3 vectors stay valid when cut short and re-normalized. */
export function shortenAndNormalize(vector: number[], dims: number): number[] {
  const cut = vector.slice(0, dims);
  const norm = Math.sqrt(cut.reduce((sum, v) => sum + v * v, 0));
  return norm === 0 ? cut : cut.map((v) => v / norm);
}

/** Small seeded generator so the 3D layout is reproducible between rebuilds. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  for (let d = 0; d < a.length; d += 1) dot += a[d]! * b[d]!;
  return 1 - dot;
}

const NO_ISSUE_REPLY =
  /^(?:(?:אין(?: לי)?(?: שום)?(?: בעיה| בעיות| תקלה| תקלות| הערות| הצעות| תלונות)?(?: טכנית| טכניות| לשיפור)?)|לא|(?:אני )?(?:אף פעם )?לא (?:נתקלתי|נתקלנו|חוויתי|מצאתי|היו לי|הייתה לי|היתה לי)(?: ב?(?:שום |אף )?(?:בעיה|בעיות|תקלה|תקלות|קושי|קשיים))?(?: מיוחדת| מיוחדות| מיוחדים| טכנית| טכניות)?(?: בקורס| במהלך הקורס)?|(?:ללא|לא היו) (?:בעיות|תקלות)(?: טכניות)?|(?:הכו?ל |זה )?(?:עובד(?:ת|ים|ות)?|תקין|בסדר)(?: טוב| מצוין| מעולה| תקין| כשורה)?)$/u;

function matchesNoIssue(text: string): boolean {
  const cleaned = text
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ תודה(?: רבה)?$/u, "");
  return NO_ISSUE_REPLY.test(cleaned);
}

/**
 * True for replies like "אין" or "אין בעיה" to a forum prompt, which are not
 * questions. The body decides, because the title is often the prompt itself.
 */
export function isNoIssueReply(
  title: string | null,
  body: string | null
): boolean {
  const text = body?.trim() || title?.trim() || "";
  return matchesNoIssue(text);
}

/** Forum prompts used as titles; they say nothing about the student's comment. */
const PROMPT_TITLE = /^בעיות טכניות(?: והצעות לשיפור)?$/u;

function hasNoWords(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  return new Set(letters).size <= 1;
}

/**
 * True when neither title nor body holds a real word: only punctuation, digits,
 * emoji, or one repeated letter. A real title with "." as its body is kept.
 */
export function isNonWordComment(
  title: string | null,
  body: string | null
): boolean {
  const cleanTitle = title?.trim() ?? "";
  return (
    (hasNoWords(cleanTitle) || PROMPT_TITLE.test(cleanTitle)) &&
    hasNoWords(body?.trim() ?? "")
  );
}

/** Only the title decides; "נעים להכיר" in a body can precede a real problem. */
export function isSelfIntroduction(title: string | null): boolean {
  return /הצגת עצמי|הצגה עצמית|הצגה אישית|היכרות|הכרות|נעים להכיר/u.test(
    title ?? ""
  );
}

/** Guards against the model answering outside the closed category list. */
export function toFixedCategory(
  name: string | undefined,
  allowed: string[],
  fallback: string
): string {
  return name !== undefined && allowed.includes(name) ? name : fallback;
}

/** Tolerant reader for model JSON: `[{ "i": 0, "name": "..." }]` under `names`. */
export function parseIndexedAnswers(raw: string): Map<number, string> {
  const out = new Map<number, string>();
  try {
    const parsed = JSON.parse(raw) as { names?: unknown };
    if (!Array.isArray(parsed.names)) return out;
    for (const row of parsed.names as { i?: unknown; name?: unknown }[]) {
      if (typeof row.i === "number" && typeof row.name === "string") {
        const name = row.name.trim();
        if (name) out.set(row.i, name.slice(0, 80));
      }
    }
  } catch {
    return new Map();
  }
  return out;
}
