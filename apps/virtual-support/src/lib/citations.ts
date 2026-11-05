/**
 * Split an answer into text and citation segments for rendering.
 * The server already validates and renumbers markers; markers outside
 * 1..sourceCount are still dropped here defensively.
 */

export type AnswerSegment =
  | { type: "text"; text: string }
  | { type: "cite"; n: number };

export function splitCitations(
  answer: string,
  sourceCount: number
): AnswerSegment[] {
  const segments: AnswerSegment[] = [];
  const pushText = (text: string) => {
    if (!text) return;
    const last = segments[segments.length - 1];
    if (last?.type === "text") last.text += text;
    else segments.push({ type: "text", text });
  };

  let cursor = 0;
  for (const match of answer.matchAll(/\[(\d+)\]/g)) {
    const index = match.index ?? 0;
    pushText(answer.slice(cursor, index));
    const n = Number(match[1]);
    if (n >= 1 && n <= sourceCount) {
      segments.push({ type: "cite", n });
    }
    cursor = index + match[0].length;
  }
  pushText(answer.slice(cursor));
  return segments;
}
