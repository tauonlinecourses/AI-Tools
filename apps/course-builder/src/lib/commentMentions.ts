import type { CommentMention, ThreadComment } from "./types";

/** True when mentions include this user id. */
export function mentionsIncludeUser(
  mentions: CommentMention[] | null | undefined,
  userId: string | null | undefined
): boolean {
  if (!userId || !mentions?.length) return false;
  return mentions.some((m) => m.user_id === userId);
}

/** True when an unresolved comment on the thread mentions this user. */
export function threadHasOpenMentionForUser(
  comments: ThreadComment[],
  userId: string | null | undefined
): boolean {
  if (!userId) return false;
  return comments.some(
    (c) => !c.resolved_at && mentionsIncludeUser(c.mentions, userId)
  );
}

/** Normalize + dedupe mentions; keep only those whose @display_name still appears in body. */
export function sanitizeMentions(
  body: string,
  mentions: CommentMention[] | null | undefined
): CommentMention[] {
  if (!mentions?.length) return [];
  const seen = new Set<string>();
  const result: CommentMention[] = [];
  for (const raw of mentions) {
    const user_id = typeof raw.user_id === "string" ? raw.user_id.trim() : "";
    const display_name =
      typeof raw.display_name === "string" ? raw.display_name.trim() : "";
    if (!user_id || !display_name) continue;
    if (seen.has(user_id)) continue;
    if (!bodyIncludesMention(body, display_name)) continue;
    seen.add(user_id);
    result.push({ user_id, display_name });
  }
  return result;
}

export function bodyIncludesMention(body: string, displayName: string): boolean {
  return body.includes(`@${displayName}`);
}

/** Coerce DB/json mentions into a typed array (missing/null → []). */
export function normalizeMentions(value: unknown): CommentMention[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: CommentMention[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const user_id = typeof row.user_id === "string" ? row.user_id.trim() : "";
    const display_name =
      typeof row.display_name === "string" ? row.display_name.trim() : "";
    if (!user_id || !display_name || seen.has(user_id)) continue;
    seen.add(user_id);
    result.push({ user_id, display_name });
  }
  return result;
}

export type CommentBodyPart =
  | { type: "text"; text: string }
  | { type: "mention"; text: string; mention: CommentMention };

/**
 * Split body into plain text + mention spans.
 * Longer display names win when overlapping; first occurrence order preserved.
 */
export function splitCommentBody(
  body: string,
  mentions: CommentMention[]
): CommentBodyPart[] {
  if (!body) return [];
  if (!mentions.length) return [{ type: "text", text: body }];

  const sorted = [...mentions].sort(
    (a, b) => b.display_name.length - a.display_name.length
  );

  type Hit = { start: number; end: number; mention: CommentMention };
  const hits: Hit[] = [];
  const taken: Array<{ start: number; end: number }> = [];

  for (const mention of sorted) {
    const needle = `@${mention.display_name}`;
    if (!needle.slice(1)) continue;
    let from = 0;
    while (from < body.length) {
      const start = body.indexOf(needle, from);
      if (start < 0) break;
      const end = start + needle.length;
      const overlaps = taken.some((r) => start < r.end && end > r.start);
      if (!overlaps) {
        hits.push({ start, end, mention });
        taken.push({ start, end });
      }
      from = start + 1;
    }
  }

  hits.sort((a, b) => a.start - b.start);

  const parts: CommentBodyPart[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start > cursor) {
      parts.push({ type: "text", text: body.slice(cursor, hit.start) });
    }
    parts.push({
      type: "mention",
      text: body.slice(hit.start, hit.end),
      mention: hit.mention,
    });
    cursor = hit.end;
  }
  if (cursor < body.length) {
    parts.push({ type: "text", text: body.slice(cursor) });
  }
  return parts.length > 0 ? parts : [{ type: "text", text: body }];
}

/** Active @query at caret (token after @ with no whitespace). */
export function getMentionQueryAtCaret(
  value: string,
  caret: number
): { start: number; query: string } | null {
  const before = value.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0) {
    const prev = before[at - 1];
    if (prev && !/\s/.test(prev)) return null;
  }
  const query = before.slice(at + 1);
  if (/\s/.test(query)) return null;
  return { start: at, query };
}

export function insertMentionAtCaret(
  value: string,
  caret: number,
  mentionStart: number,
  displayName: string
): { value: string; caret: number } {
  const insertion = `@${displayName} `;
  const next = value.slice(0, mentionStart) + insertion + value.slice(caret);
  return { value: next, caret: mentionStart + insertion.length };
}
