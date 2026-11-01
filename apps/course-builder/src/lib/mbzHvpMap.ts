/**
 * Map Moodle H5P (hvp) JSON into Course Builder text / question blocks.
 */

import { unescapeXmlEntities, vfsText, type MbzActivity, type MbzVfs } from "@workspace/mbz-parser";
import type { QuestionOption, QuestionType } from "./types";
import { splitMoodleHtmlToComponents, type MappedComponent } from "./mbzHtmlSplit";

export type { MappedComponent };

function libraryBase(library?: string): string {
  if (!library) return "";
  return library.split(" ")[0] ?? library;
}

function isTruthy(val: unknown): boolean {
  return val === true || val === 1 || val === "1" || val === "true";
}

function stripHtml(html: string): string {
  return unescapeXmlEntities(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function newId(): string {
  return crypto.randomUUID();
}

function extractJsonContent(rawXml: string): unknown | null {
  const cdata = rawXml.match(
    /<json_content(?:\s[^>]*)?>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/json_content>/i
  );
  const plain = rawXml.match(/<json_content(?:\s[^>]*)?>([\s\S]*?)<\/json_content>/i);
  const body = (cdata?.[1] ?? plain?.[1] ?? "").trim();
  if (!body || body === "$@NULL@$") return null;
  const candidates = [unescapeXmlEntities(body), body];
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      /* try next */
    }
  }
  return null;
}

function extractIntroHtml(rawXml: string): string | null {
  const m = rawXml.match(/<intro(?:\s[^>]*)?>([\s\S]*?)<\/intro>/i);
  const body = m?.[1]?.trim() ?? "";
  if (!body || body === "$@NULL@$") return null;
  return unescapeXmlEntities(body);
}

function pushText(out: MappedComponent[], html: string) {
  const trimmed = html.trim();
  if (!trimmed) return;
  out.push({
    type: "text",
    position: out.length,
    props: { html: trimmed },
  });
}

function pushQuestion(
  out: MappedComponent[],
  args: {
    questionType: QuestionType;
    prompt: string;
    options: QuestionOption[];
    correctOptionId?: string;
  }
) {
  if (!args.prompt.trim() && args.options.length === 0) return;
  out.push({
    type: "question",
    position: out.length,
    props: {
      questionType: args.questionType,
      prompt: args.prompt,
      options: args.options,
      correctOptionId: args.correctOptionId,
    },
  });
}

/**
 * QuestionBlock hard-codes yes/no option ids as `__correct` / `__incorrect`
 * (see YES_NO_OPTIONS). correctOptionId must use those ids or the UI never
 * highlights the right answer.
 */
const YES_NO_CORRECT_ID = "__correct";
const YES_NO_INCORRECT_ID = "__incorrect";

function mapTrueFalse(params: Record<string, unknown>, out: MappedComponent[]) {
  const prompt = stripHtml(String(params.question ?? ""));
  const correctIsTrue = isTruthy(params.correct);
  pushQuestion(out, {
    questionType: "yes_no",
    prompt,
    options: [
      { id: YES_NO_CORRECT_ID, text: "נכון" },
      { id: YES_NO_INCORRECT_ID, text: "לא נכון" },
    ],
    correctOptionId: correctIsTrue ? YES_NO_CORRECT_ID : YES_NO_INCORRECT_ID,
  });
}

function mapMultiChoice(params: Record<string, unknown>, out: MappedComponent[]) {
  const prompt = stripHtml(String(params.question ?? ""));
  const answers = Array.isArray(params.answers) ? params.answers : [];
  const options: QuestionOption[] = [];
  const correctIds: string[] = [];
  for (const raw of answers) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as Record<string, unknown>;
    const id = newId();
    options.push({ id, text: stripHtml(String(a.text ?? "")) });
    if (isTruthy(a.correct)) correctIds.push(id);
  }
  const behaviour = (params.behaviour ?? {}) as Record<string, unknown>;
  const forceSingle =
    behaviour.type === "single" ||
    behaviour.singleAnswer === true ||
    behaviour.singlePoint === true;
  const questionType: QuestionType =
    !forceSingle && correctIds.length > 1 ? "multiple_choice" : "single_choice";
  pushQuestion(out, {
    questionType,
    prompt,
    options,
    correctOptionId:
      questionType === "multiple_choice" ? correctIds.join(",") : correctIds[0],
  });
}

function mapDragText(params: Record<string, unknown>, out: MappedComponent[]) {
  const desc = stripHtml(String(params.taskDescription ?? ""));
  const field = String(params.textField ?? "");
  // Keep *word* markers visible for implementers
  const body = [desc, field].filter(Boolean).join("\n\n");
  if (body.trim()) {
    pushText(out, `<p>${body.replace(/\n/g, "<br/>")}</p>`);
  }
}

function mapAdvancedText(params: Record<string, unknown>, out: MappedComponent[]) {
  const text = String(params.text ?? "");
  if (text.trim()) pushText(out, text);
}

const MAPPED_LIBS = new Set([
  "H5P.Column",
  "H5P.QuestionSet",
  "H5P.TrueFalse",
  "H5P.MultiChoice",
  "H5P.AdvancedText",
  "H5P.Text",
  "H5P.DragText",
  "H5P.DragQuestion",
]);

/** Recursively collect mappable H5P content nodes in document order. */
function walkH5pNode(node: unknown, out: MappedComponent[], seen = new Set<unknown>()) {
  if (!node || typeof node !== "object") return;
  if (seen.has(node)) return;
  seen.add(node);

  if (Array.isArray(node)) {
    for (const item of node) walkH5pNode(item, out, seen);
    return;
  }

  const rec = node as Record<string, unknown>;

  // Column item wrapper: { content: { library, params }, useSeparator }
  if (rec.content && typeof rec.content === "object" && !Array.isArray(rec.content)) {
    const inner = rec.content as Record<string, unknown>;
    if (typeof inner.library === "string") {
      walkLibrary(String(inner.library), (inner.params ?? {}) as Record<string, unknown>, out, seen);
      return;
    }
  }

  if (typeof rec.library === "string") {
    walkLibrary(String(rec.library), (rec.params ?? {}) as Record<string, unknown>, out, seen);
    return;
  }

  // Root Column / generic containers
  if (Array.isArray(rec.content)) {
    for (const item of rec.content) walkH5pNode(item, out, seen);
  }
  if (Array.isArray(rec.questions)) {
    for (const q of rec.questions) walkH5pNode(q, out, seen);
  }
}

function walkLibrary(
  library: string,
  params: Record<string, unknown>,
  out: MappedComponent[],
  seen: Set<unknown>
) {
  const base = libraryBase(library);
  switch (base) {
    case "H5P.Column":
      if (Array.isArray(params.content)) {
        for (const item of params.content) walkH5pNode(item, out, seen);
      }
      break;
    case "H5P.QuestionSet":
      if (Array.isArray(params.questions)) {
        for (const q of params.questions) walkH5pNode(q, out, seen);
      }
      break;
    case "H5P.TrueFalse":
      mapTrueFalse(params, out);
      break;
    case "H5P.MultiChoice":
      mapMultiChoice(params, out);
      break;
    case "H5P.AdvancedText":
    case "H5P.Text":
      mapAdvancedText(params, out);
      break;
    case "H5P.DragText":
      mapDragText(params, out);
      break;
    case "H5P.DragQuestion": {
      const before = out.length;
      // Pull any nested AdvancedText / questions from inside the drag activity
      for (const v of Object.values(params)) walkH5pNode(v, out, seen);
      if (out.length === before) {
        const q = stripHtml(String(params.question ?? params.taskDescription ?? ""));
        pushText(
          out,
          q
            ? `<p>${q}</p><p><em>פעילות גרירה (H5P) — יש להטמיע ידנית ב-Moodle</em></p>`
            : `<p><em>פעילות גרירה (H5P) — יש להטמיע ידנית ב-Moodle</em></p>`
        );
      } else {
        pushText(out, `<p><em>פעילות גרירה (H5P) — יש להטמיע ידנית ב-Moodle</em></p>`);
      }
      break;
    }
    default: {
      // Nested unknown: scan children for mapped libs; else one implementer note
      const before = out.length;
      for (const v of Object.values(params)) walkH5pNode(v, out, seen);
      if (out.length === before && MAPPED_LIBS.has(base) === false) {
        const title = stripHtml(String(params.question ?? params.taskDescription ?? ""));
        pushText(
          out,
          title
            ? `<p>${title}</p><p><em>תוכן H5P (${base}) — יש להטמיע ידנית ב-Moodle</em></p>`
            : `<p><em>תוכן H5P (${base || "לא ידוע"}) — יש להטמיע ידנית ב-Moodle</em></p>`
        );
      }
      break;
    }
  }
}

/** Build CB components from an hvp activity payload. */
export function mapHvpActivityToComponents(
  vfs: MbzVfs,
  activity: MbzActivity
): { components: MappedComponent[]; introHtml: string | null } {
  const raw = vfsText(vfs, activity.rawXmlPath) ?? "";
  const introHtml = extractIntroHtml(raw);
  const components: MappedComponent[] = [];
  if (introHtml?.trim()) {
    components.push(...splitMoodleHtmlToComponents(introHtml));
  }

  const parsed = extractJsonContent(raw);
  if (parsed) {
    walkH5pNode(parsed, components);
  } else if (components.length === 0) {
    pushText(components, `<p><em>לא ניתן היה לפענח את תוכן ה-H5P</em></p>`);
  }

  // Re-number positions
  components.forEach((c, i) => {
    c.position = i;
  });
  return { components, introHtml };
}
