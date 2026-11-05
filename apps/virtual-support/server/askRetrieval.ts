/**
 * Pure retrieval helpers for Ask (no I/O), kept separate so they are unit-testable.
 *
 * - extractKeywordTerms: question → keyword terms for the hybrid SQL search.
 * - rankPages: hybrid chunk hits → relevant pages, best first.
 * - buildContext: full page texts → numbered context block within a char budget.
 */

export type HybridHit = {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  similarity: number;
  keyword_rank: number;
  rrf_score: number;
};

/** One query word plus its Hebrew prefix-stripped variants. */
export type TermGroup = {
  variants: string[];
  /** Contains Latin letters or digits (error codes, product names). */
  distinctive: boolean;
};

export type KeywordQuery = {
  /** Space-separated terms sent to SQL (OR-ed there). */
  text: string;
  groups: TermGroup[];
};

export type RankedPage = {
  documentId: string;
  bestHit: HybridHit;
  bestSimilarity: number;
  bestRrf: number;
};

export type ContextPage = {
  documentId: string;
  title: string;
  folderName: string | null;
  text: string;
};

export type ContextResult = {
  block: string;
  /** Pages that made it into the block, in order ([מסמך 1] = index 0). */
  included: ContextPage[];
};

// Question words and function words that would match nearly every page.
const STOPWORDS = new Set([
  // Hebrew
  "איך", "מה", "למה", "מדוע", "מתי", "איפה", "היכן", "מי", "כמה", "האם",
  "של", "את", "על", "עם", "אל", "זה", "זו", "זאת", "אלה", "יש", "אין",
  "אני", "אתה", "הוא", "היא", "אנחנו", "הם", "הן", "אם", "או", "גם",
  "כל", "לא", "כן", "אבל", "כדי", "אפשר", "צריך", "צריכה", "צריכים",
  "עושים", "לעשות", "עושה", "רוצה", "ניתן", "יכול", "יכולה", "שלי", "לי",
  "לו", "לה", "לנו", "להם", "עוד", "כבר", "רק", "אז", "כמו", "בין", "אחרי",
  "לפני", "ואם",
  // English
  "the", "a", "an", "to", "of", "how", "what", "why", "when", "where", "who",
  "is", "are", "in", "on", "for", "and", "or", "do", "does", "can", "i",
  "it", "my", "with",
]);

// Single-letter Hebrew prefixes (ו ה ב ל מ ש כ) commonly glued to words.
const HEBREW_PREFIXES = new Set(["ו", "ה", "ב", "ל", "מ", "ש", "כ"]);
const HEBREW_LETTER = /[א-ת]/;

/**
 * Lowercase and split into word tokens (letters, digits, `_`, `-`).
 * Hyphenated tokens also yield their parts, like Postgres's parser does, so
 * "ל-VPN" matches "vpn" and "ERR-42" matches "err-42", "err" and "42".
 */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}_-]+/u)) {
    const token = raw.replace(/^-+|-+$/g, "");
    if (!token) continue;
    out.push(token);
    if (token.includes("-")) {
      out.push(...token.split("-").filter(Boolean));
    }
  }
  return out;
}

function hebrewVariants(token: string): string[] {
  const variants = [token];
  if (!HEBREW_LETTER.test(token[0] ?? "")) return variants;
  // Strip one prefix letter (e.g. המדפסת → מדפסת) when the rest is still a word.
  if (token.length >= 4 && HEBREW_PREFIXES.has(token[0]!)) {
    variants.push(token.slice(1));
    // Common double prefixes: וה / שה / וב / של … (e.g. והמדפסת → מדפסת).
    if (
      token.length >= 5 &&
      (token[0] === "ו" || token[0] === "ש") &&
      HEBREW_PREFIXES.has(token[1]!)
    ) {
      variants.push(token.slice(2));
    }
  }
  return variants;
}

export function extractKeywordTerms(question: string): KeywordQuery {
  const seen = new Set<string>();
  const groups: TermGroup[] = [];
  for (const token of tokenize(question)) {
    if (token.length < 2 || STOPWORDS.has(token) || seen.has(token)) continue;
    seen.add(token);
    groups.push({
      variants: hebrewVariants(token),
      distinctive: /[a-z0-9]/.test(token),
    });
  }
  const terms = [...new Set(groups.flatMap((g) => g.variants))];
  return { text: terms.join(" "), groups };
}

/**
 * A keyword hit is "strong" when the chunk contains a distinctive term
 * (Latin/digits, e.g. an error code) or at least two different query words.
 */
export function isStrongKeywordMatch(
  content: string,
  groups: TermGroup[]
): boolean {
  if (groups.length === 0) return false;
  const tokens = new Set(tokenize(content));
  let matched = 0;
  for (const group of groups) {
    if (group.variants.some((v) => tokens.has(v))) {
      if (group.distinctive) return true;
      matched += 1;
      if (matched >= 2) return true;
    }
  }
  return false;
}

/** A chunk counts as relevant if it is semantically close or a strong keyword hit. */
export function isRelevantHit(
  hit: HybridHit,
  groups: TermGroup[],
  similarityThreshold: number
): boolean {
  if (hit.similarity > similarityThreshold) return true;
  return hit.keyword_rank > 0 && isStrongKeywordMatch(hit.content, groups);
}

/**
 * Keep relevant chunks, group them by page, and rank pages by their best
 * fused (RRF) score. Returns at most maxPages pages.
 */
export function rankPages(
  hits: HybridHit[],
  groups: TermGroup[],
  similarityThreshold: number,
  maxPages: number
): RankedPage[] {
  const byDoc = new Map<string, RankedPage>();
  for (const hit of hits) {
    if (!isRelevantHit(hit, groups, similarityThreshold)) continue;
    const prev = byDoc.get(hit.document_id);
    if (!prev) {
      byDoc.set(hit.document_id, {
        documentId: hit.document_id,
        bestHit: hit,
        bestSimilarity: hit.similarity,
        bestRrf: hit.rrf_score,
      });
      continue;
    }
    if (hit.rrf_score > prev.bestRrf) {
      prev.bestHit = hit;
      prev.bestRrf = hit.rrf_score;
    }
    prev.bestSimilarity = Math.max(prev.bestSimilarity, hit.similarity);
  }
  return [...byDoc.values()]
    .sort(
      (a, b) => b.bestRrf - a.bestRrf || b.bestSimilarity - a.bestSimilarity
    )
    .slice(0, maxPages);
}

function pageHeader(page: ContextPage, index: number): string {
  const folder = page.folderName ? ` (${page.folderName})` : "";
  return `[מסמך ${index + 1}: ${page.title}${folder}]\n`;
}

export const CONTEXT_SEPARATOR = "\n\n---\n\n";
/** Below this many chars of body, a truncated page is not worth including. */
export const MIN_PAGE_CHARS = 400;
export const TRUNCATION_MARK = "\n[…המסמך קוצר]";

/**
 * Fill pages in rank order until the budget runs out. A page that does not fit
 * fully is truncated (if enough room is left) and later pages are dropped, so
 * lower-ranked pages are always the first to lose text.
 */
export function buildContext(
  pages: ContextPage[],
  budget: number
): ContextResult {
  const parts: string[] = [];
  const included: ContextPage[] = [];
  let used = 0;

  for (const page of pages) {
    const sep = parts.length > 0 ? CONTEXT_SEPARATOR.length : 0;
    const header = pageHeader(page, included.length);
    const remaining = budget - used - sep - header.length;
    if (remaining <= 0) break;

    const body = page.text.trim() || page.title;
    if (body.length <= remaining) {
      parts.push(header + body);
      included.push(page);
      used += sep + header.length + body.length;
      continue;
    }

    const room = remaining - TRUNCATION_MARK.length;
    if (room >= MIN_PAGE_CHARS) {
      parts.push(header + body.slice(0, room).trimEnd() + TRUNCATION_MARK);
      included.push(page);
    }
    break;
  }

  return { block: parts.join(CONTEXT_SEPARATOR), included };
}
