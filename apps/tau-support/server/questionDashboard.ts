/**
 * Builds the question dashboard in three short steps, so each one fits inside
 * a serverless time limit: embed new questions → sort each new question into a
 * category with a small AI model (saved, so it runs once per question) → save
 * every question with its category and a 3D map position as one snapshot row.
 */

import {
  DASHBOARD_FORMAT_VERSION,
  type DashboardPoint,
  type DashboardStepResult,
  type QuestionStatus,
  type DashboardSnapshot,
} from "../src/lib/dashboardTypes.js";
import { CATEGORY_COLORS } from "../src/lib/categoryColors.js";
import { embedTexts } from "../src/lib/embedClient.js";
import { normalizeQuestionForRetrieval } from "../src/lib/kbSearch.js";
import { hashContent } from "../src/lib/qaPairing.js";
import {
  cosineDistance,
  isNoIssueReply,
  isNonWordComment,
  isSelfIntroduction,
  parseIndexedAnswers,
  seededRandom,
  shortenAndNormalize,
  toFixedCategory,
} from "../src/lib/questionClustering.js";
import { supabase } from "../src/lib/supabase.js";

const STORED_DIMS = 256;
/** Newest questions kept in one analysis; bounds memory and run time. */
export const MAX_DASHBOARD_QUESTIONS = 4000;

const EMBED_BATCH_SIZE = 32;
const EMBED_BATCHES_PER_CALL = 12;
const MAX_EMBED_CHARS = 2000;
const PAGE_SIZE = 1000;
const LAYOUT_SEED = 42;
const FALLBACK_CATEGORY = "אחר";
const NO_ISSUE_CATEGORY = "אין בעיות";
const NO_CONTENT_CATEGORY = "תגובות ללא תוכן";
/** The only categories the AI may use; edit the list in categoryColors.ts. */
const FIXED_CATEGORIES = Object.keys(CATEGORY_COLORS);
/** Comments that are not questions: sorted by rule, without the AI. */
const RULE_CATEGORIES = [
  { category: NO_ISSUE_CATEGORY, matches: isNoIssueReply },
  { category: NO_CONTENT_CATEGORY, matches: isNonWordComment },
  { category: FALLBACK_CATEGORY, matches: isSelfIntroduction },
];
const SNAPSHOT_ID = "singleton";
const MAX_SNIPPET_CHARS = 120;
const BODY_LOOKUP_BATCH = 100;
/** Per-question sorting: cheap model, tested at 83% on 18 hand-labeled rows. */
const CATEGORY_MODEL = "gpt-4o-mini";
/** Bump when QUESTION_CATEGORY_PROMPT changes, so every question is re-sorted. */
const CATEGORY_PROMPT_VERSION = "3";
const CATEGORY_BATCH_SIZE = 40;
const CATEGORY_PARALLEL_BATCHES = 8;
/** Batches per request; two parallel rounds stay well inside 60 seconds. */
const CATEGORY_BATCHES_PER_CALL = 16;
const CATEGORY_WRITE_PARALLEL = 20;
const MAX_BODY_DISPLAY_CHARS = 3000;
const MIGRATION_HINT =
  "טבלאות הדשבורד חסרות. יש להריץ את migrations 010_question_dashboard.sql ו-011_question_categories.sql ב-Supabase.";

interface ThreadRow {
  campus_thread_id: string;
  course_id: string;
  title: string | null;
  body_text: string | null;
  created_at: string | null;
  no_answer_needed: boolean;
}

interface EmbeddingRow {
  thread_id: string;
  embedding: string | number[];
  category: string | null;
}

function db() {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

function friendlyError(err: unknown): string {
  const { code, message } = (err ?? {}) as { code?: string; message?: string };
  // 42703 / PGRST204: the 011 category columns are missing.
  if (["42P01", "PGRST205", "42703", "PGRST204"].includes(code ?? "")) {
    return MIGRATION_HINT;
  }
  return message || (err instanceof Error ? err.message : "Dashboard step failed");
}

/** PostgREST returns at most 1000 rows per request, so page explicitly. */
async function fetchAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function loadStudentThreads(): Promise<ThreadRow[]> {
  return fetchAll<ThreadRow>((from, to) =>
    db()
      .from("threads")
      .select(
        "campus_thread_id, course_id, title, body_text, created_at, no_answer_needed"
      )
      .eq("op_is_staff", false)
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("campus_thread_id", { ascending: true })
      .range(from, to)
  );
}

function questionText(thread: ThreadRow): string {
  const joined = [thread.title?.trim(), thread.body_text?.trim()]
    .filter(Boolean)
    .join("\n\n");
  return normalizeQuestionForRetrieval(joined).slice(0, MAX_EMBED_CHARS);
}

/** Step 1: embed a bounded number of new or changed questions. */
export async function embedDashboardQuestions(): Promise<DashboardStepResult> {
  try {
    const [threads, existing] = await Promise.all([
      loadStudentThreads(),
      fetchAll<{ thread_id: string; content_hash: string }>((from, to) =>
        db()
          .from("question_embeddings")
          .select("thread_id, content_hash")
          .order("thread_id", { ascending: true })
          .range(from, to)
      ),
    ]);

    const hashes = new Map(existing.map((r) => [r.thread_id, r.content_hash]));
    const pending = threads
      .map((thread) => {
        const text = questionText(thread);
        return { thread, text, hash: hashContent(text) };
      })
      .filter((q) => q.text && hashes.get(q.thread.campus_thread_id) !== q.hash);

    const toEmbed = pending.slice(0, EMBED_BATCH_SIZE * EMBED_BATCHES_PER_CALL);
    for (let i = 0; i < toEmbed.length; i += EMBED_BATCH_SIZE) {
      const batch = toEmbed.slice(i, i + EMBED_BATCH_SIZE);
      const { embeddings } = await embedTexts(batch.map((q) => q.text));
      const { error } = await db()
        .from("question_embeddings")
        .upsert(
          batch.map((q, idx) => ({
            thread_id: q.thread.campus_thread_id,
            course_id: q.thread.course_id,
            question_text: q.text,
            content_hash: q.hash,
            embedding: shortenAndNormalize(embeddings[idx]!, STORED_DIMS),
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "thread_id" }
        );
      if (error) throw error;
    }

    return {
      ok: true,
      embedded: toEmbed.length,
      remaining: pending.length - toEmbed.length,
    };
  } catch (err) {
    return { ok: false, message: friendlyError(err) };
  }
}

function parseVector(value: string | number[]): number[] {
  return typeof value === "string" ? (JSON.parse(value) as number[]) : value;
}

async function layoutIn3D(vectors: number[][]): Promise<number[][]> {
  const n = vectors.length;
  if (n < 4) return vectors.map((_, i) => [i, 0, 0]);

  // umap-js is CommonJS; its named export depends on the module loader.
  const mod = (await import("umap-js")) as unknown as {
    UMAP?: typeof import("umap-js").UMAP;
    default?: { UMAP: typeof import("umap-js").UMAP };
  };
  const UMAP = mod.UMAP ?? mod.default!.UMAP;
  return new UMAP({
    nComponents: 3,
    nNeighbors: Math.min(15, n - 1),
    minDist: 0.1,
    nEpochs: 200,
    distanceFn: cosineDistance,
    random: seededRandom(LAYOUT_SEED),
  }).fit(vectors);
}

/** Keeps the snapshot well under Vercel's response size limit. */
function roundCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function statusOf(thread: ThreadRow, answeredIds: Set<string>): QuestionStatus {
  if (answeredIds.has(thread.campus_thread_id)) return "answered";
  return thread.no_answer_needed ? "no_answer_needed" : "unanswered";
}

function displayTitle(thread: ThreadRow): string {
  const text = thread.title?.trim() || thread.body_text?.trim() || "(ללא כותרת)";
  return text.replace(/\s+/g, " ").slice(0, 140);
}

/** Short enough that a full snapshot stays under Vercel's response size limit. */
function bodySnippet(thread: ThreadRow): string {
  const text = (thread.body_text ?? "").trim().replace(/\s+/g, " ");
  return text.length > MAX_SNIPPET_CHARS
    ? `${text.slice(0, MAX_SNIPPET_CHARS)}…`
    : text;
}

async function saveSnapshot(snapshot: DashboardSnapshot): Promise<void> {
  const { error } = await db()
    .from("question_dashboard_snapshot")
    .upsert({
      id: SNAPSHOT_ID,
      computed_at: snapshot.computedAt,
      payload: snapshot,
    });
  if (error) throw error;
}

/** The rule-based category for posts that are not questions, if any. */
function ruleCategory(thread: ThreadRow): string | null {
  return (
    RULE_CATEGORIES.find((r) => r.matches(thread.title, thread.body_text))
      ?.category ?? null
  );
}

/** The text the category model sees: same format as the tested sample. */
function categoryInput(thread: ThreadRow): string {
  return `${displayTitle(thread)} — ${bodySnippet(thread)}`;
}

function categoryKey(contentHash: string): string {
  return `${contentHash}:${CATEGORY_PROMPT_VERSION}`;
}

/** One batch → category per thread id; a failed call returns an empty map. */
async function categorizeBatch(
  batch: ThreadRow[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const answers = parseIndexedAnswers(
      await serverChat({
        model: CATEGORY_MODEL,
        messages: [
          {
            role: "user",
            content: batch.map((t, i) => `${i}: ${categoryInput(t)}`).join("\n"),
          },
        ],
        systemPrompt: QUESTION_CATEGORY_PROMPT,
        temperature: 0.1,
        responseFormat: { type: "json_object" },
      })
    );
    answers.forEach((name, i) => {
      const thread = batch[i];
      if (thread) {
        out.set(
          thread.campus_thread_id,
          toFixedCategory(name, FIXED_CATEGORIES, FALLBACK_CATEGORY)
        );
      }
    });
  } catch {
    // Left unsorted; the next refresh tries these questions again.
  }
  return out;
}

/**
 * Step 2: sort new or edited questions into the fixed categories, a bounded
 * number per call. The answer is saved, so each question is sorted once.
 */
export async function categorizeDashboardQuestions(): Promise<DashboardStepResult> {
  try {
    const [allThreads, rows] = await Promise.all([
      loadStudentThreads(),
      fetchAll<{ thread_id: string; content_hash: string; category_key: string | null }>(
        (from, to) =>
          db()
            .from("question_embeddings")
            .select("thread_id, content_hash, category_key")
            .order("thread_id", { ascending: true })
            .range(from, to)
      ),
    ]);

    const rowById = new Map(rows.map((r) => [r.thread_id, r]));
    const pending = allThreads
      .filter((t) => rowById.has(t.campus_thread_id))
      .slice(0, MAX_DASHBOARD_QUESTIONS)
      .filter((t) => ruleCategory(t) === null)
      .filter((t) => {
        const row = rowById.get(t.campus_thread_id)!;
        return row.category_key !== categoryKey(row.content_hash);
      });

    const toSort = pending.slice(0, CATEGORY_BATCH_SIZE * CATEGORY_BATCHES_PER_CALL);
    const batches: ThreadRow[][] = [];
    for (let i = 0; i < toSort.length; i += CATEGORY_BATCH_SIZE) {
      batches.push(toSort.slice(i, i + CATEGORY_BATCH_SIZE));
    }
    const categoryById = new Map<string, string>();
    for (let i = 0; i < batches.length; i += CATEGORY_PARALLEL_BATCHES) {
      const results = await Promise.all(
        batches.slice(i, i + CATEGORY_PARALLEL_BATCHES).map(categorizeBatch)
      );
      for (const result of results) result.forEach((v, k) => categoryById.set(k, v));
    }

    // Upsert would need every not-null column, so update row by row.
    const updates = [...categoryById];
    for (let i = 0; i < updates.length; i += CATEGORY_WRITE_PARALLEL) {
      const results = await Promise.all(
        updates.slice(i, i + CATEGORY_WRITE_PARALLEL).map(([threadId, category]) =>
          db()
            .from("question_embeddings")
            .update({
              category,
              category_key: categoryKey(rowById.get(threadId)!.content_hash),
            })
            .eq("thread_id", threadId)
        )
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    }

    return {
      ok: true,
      categorized: categoryById.size,
      remaining: pending.length - categoryById.size,
    };
  } catch (err) {
    return { ok: false, message: friendlyError(err) };
  }
}

/**
 * Step 3: save every question with its category and a 3D map position.
 * Rule-based posts get their category by rule; the rest use the saved AI
 * category, or "אחר" until a refresh manages to sort them.
 */
export async function buildDashboardSnapshot(): Promise<DashboardStepResult> {
  try {
    const [allThreads, answered, embeddingRows] = await Promise.all([
      loadStudentThreads(),
      fetchAll<{ thread_id: string }>((from, to) =>
        db()
          .from("qa_pairs")
          .select("thread_id")
          .order("thread_id", { ascending: true })
          .range(from, to)
      ),
      fetchAll<EmbeddingRow>((from, to) =>
        db()
          .from("question_embeddings")
          .select("thread_id, embedding, category")
          .order("thread_id", { ascending: true })
          .range(from, to)
      ),
    ]);

    const rowById = new Map(embeddingRows.map((r) => [r.thread_id, r]));
    const embedded = allThreads.filter((t) => rowById.has(t.campus_thread_id));
    const threads = embedded.slice(0, MAX_DASHBOARD_QUESTIONS);
    const vectors = threads.map((t) =>
      parseVector(rowById.get(t.campus_thread_id)!.embedding)
    );
    const answeredIds = new Set(answered.map((r) => r.thread_id));

    let unsorted = 0;
    const categories = threads.map((t) => {
      const byRule = ruleCategory(t);
      if (byRule) return byRule;
      const saved = rowById.get(t.campus_thread_id)!.category;
      if (!saved) unsorted += 1;
      return saved ?? FALLBACK_CATEGORY;
    });

    const positions = await layoutIn3D(vectors);
    const points: DashboardPoint[] = threads.map((thread, i) => ({
      threadId: thread.campus_thread_id,
      courseId: thread.course_id,
      title: displayTitle(thread),
      snippet: bodySnippet(thread),
      createdAt: thread.created_at,
      status: statusOf(thread, answeredIds),
      category: categories[i]!,
      x: roundCoordinate(positions[i]![0]!),
      y: roundCoordinate(positions[i]![1]!),
      z: roundCoordinate(positions[i]![2]!),
    }));

    await saveSnapshot({
      formatVersion: DASHBOARD_FORMAT_VERSION,
      computedAt: new Date().toISOString(),
      totalAvailable: embedded.length,
      points,
    });
    return {
      ok: true,
      questions: points.length,
      message:
        unsorted > 0
          ? `${unsorted} שאלות עדיין לא מוינו לקטגוריה ומוצגות תחת "${FALLBACK_CATEGORY}". רענון נוסף ינסה שוב.`
          : undefined,
    };
  } catch (err) {
    return { ok: false, message: friendlyError(err) };
  }
}

type ChatOptions = Parameters<
  typeof import("@workspace/ai-client/client").aiChat
>[0];

async function serverChat(options: ChatOptions): Promise<string> {
  const { handler } = await import("@workspace/ai-client/server");
  const res = await handler(
    new Request("http://local/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    })
  );
  if (!res.ok) throw new Error(`AI request failed (${res.status})`);
  const data = (await res.json()) as { content?: string };
  return data.content ?? "";
}

/** Exported for scripts/category-test.smoke.ts, which tests per-question sorting. */
export const QUESTION_CATEGORY_PROMPT = [
  "לפניך תגובות ממוספרות של סטודנטים בפורום תמיכה טכנית (כותרת ותוכן).",
  "שייך/י כל תגובה לקטגוריה אחת בדיוק מתוך הרשימה הסגורה הבאה, והשתמש/י בשמות הקטגוריות בדיוק כפי שהם כתובים:",
  ...FIXED_CATEGORIES.map((category) => `- ${category}`),
  `"${NO_ISSUE_CATEGORY}" מיועדת לתגובות שמדווחות רק שהכול עובד ואין תקלה.`,
  `תגובה על חוויית הלמידה בקורס (שבח, ביקורת או הצעה) שייכת ל"משוב והצעות לשיפור", גם אם היא מציינת גם שלא היו בעיות.`,
  `דיווח על תקלה או הודעת שגיאה (למשל 502) לעולם לא שייך ל"${NO_ISSUE_CATEGORY}". שייך/י אותו לקטגוריה של המקום שבו התקלה קרתה, למשל סרטון שלא נטען או בלי קול שייך ל"סרטונים ווידאו".`,
  `"${NO_CONTENT_CATEGORY}" רק כשגם הכותרת וגם התוכן ריקים ממשמעות (למשל "בדיקה", ברכה בלבד, נקודה, אותיות אקראיות).`,
  `שפוט/י את התגובה כולה: אם בכותרת או בתוכן יש שאלה או תיאור בעיה, סווג/י לפיה, גם אם החלק השני הוא רק ברכה כמו "היי" או נקודה.`,
  `תגובה שבה סטודנט מציג את עצמו ומספר על עצמו, בלי שאלה טכנית, שייכת ל"${FALLBACK_CATEGORY}".`,
  `אסור להמציא קטגוריות חדשות. השתמש/י ב"${FALLBACK_CATEGORY}" רק אם אף קטגוריה אחרת לא מתאימה.`,
  'החזר/י JSON בלבד בצורה: {"names":[{"i":0,"name":"שם הקטגוריה"}]}',
].join("\n");

/** Question bodies for one opened category; kept out of the snapshot to keep it small. */
export async function getDashboardQuestionBodies(
  threadIds: string[]
): Promise<Record<string, string>> {
  const ids = threadIds.slice(0, MAX_DASHBOARD_QUESTIONS);
  const bodies: Record<string, string> = {};
  // Ids go in the request URL, so long lists are split.
  for (let i = 0; i < ids.length; i += BODY_LOOKUP_BATCH) {
    const { data, error } = await db()
      .from("threads")
      .select("campus_thread_id, body_text")
      .in("campus_thread_id", ids.slice(i, i + BODY_LOOKUP_BATCH));
    if (error) throw new Error(friendlyError(error));
    for (const row of (data ?? []) as {
      campus_thread_id: string;
      body_text: string | null;
    }[]) {
      bodies[row.campus_thread_id] = (row.body_text ?? "")
        .trim()
        .slice(0, MAX_BODY_DISPLAY_CHARS);
    }
  }
  return bodies;
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot | null> {
  const { data, error } = await db()
    .from("question_dashboard_snapshot")
    .select("payload")
    .eq("id", SNAPSHOT_ID)
    .maybeSingle();
  if (error) throw new Error(friendlyError(error));
  return (data?.payload as DashboardSnapshot | undefined) ?? null;
}
