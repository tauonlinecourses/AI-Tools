/**
 * Builds the question dashboard in three short steps, so each one fits inside
 * a serverless time limit: embed new questions → cluster + lay out in 3D → name
 * the clusters with AI. Results are saved as one snapshot row.
 */

import type {
  DashboardCluster,
  DashboardPoint,
  DashboardSnapshot,
  DashboardStepResult,
  QuestionStatus,
} from "../src/lib/dashboardTypes.js";
import { CATEGORY_COLORS } from "../src/lib/categoryColors.js";
import { embedTexts } from "../src/lib/embedClient.js";
import { normalizeQuestionForRetrieval } from "../src/lib/kbSearch.js";
import { hashContent } from "../src/lib/qaPairing.js";
import {
  assignLoneQuestions,
  clusterBySimilarity,
  cosineDistance,
  isNoIssueReply,
  isNonWordComment,
  isSelfIntroduction,
  mergeClusters,
  orderByCentrality,
  parseCategoryAssignment,
  parseClusterMerges,
  parseClusterNames,
  seededRandom,
  shortenAndNormalize,
  toFixedCategory,
} from "../src/lib/questionClustering.js";
import { supabase } from "../src/lib/supabase.js";

const STORED_DIMS = 256;
/** Tune on real data: higher = fewer, tighter groups of repeated questions. */
export const SIMILARITY_THRESHOLD = 0.6;
/** Newest questions kept in one analysis; bounds memory and run time. */
export const MAX_DASHBOARD_QUESTIONS = 4000;

const EMBED_BATCH_SIZE = 32;
const EMBED_BATCHES_PER_CALL = 12;
const MAX_EMBED_CHARS = 2000;
const PAGE_SIZE = 1000;
const LAYOUT_SEED = 42;
const MAX_CLUSTERS_TO_NAME = 150;
const NAMING_BATCH_SIZE = 25;
const SAMPLES_PER_CLUSTER = 5;
const MAX_SAMPLE_CHARS = 200;
const FALLBACK_CATEGORY = "אחר";
const NO_ISSUE_CATEGORY = "אין בעיות";
const NO_CONTENT_CATEGORY = "תגובות ללא תוכן";
const SELF_INTRO_NAME = "הצגה עצמית";
/** The only categories the AI may use; edit the list in categoryColors.ts. */
const FIXED_CATEGORIES = Object.keys(CATEGORY_COLORS);
/** Comments that are not questions: kept out of similarity groups and AI steps. */
const RESERVED_GROUPS = [
  { label: NO_ISSUE_CATEGORY, matches: isNoIssueReply },
  { label: NO_CONTENT_CATEGORY, matches: isNonWordComment },
  {
    label: SELF_INTRO_NAME,
    category: FALLBACK_CATEGORY,
    matches: isSelfIntroduction,
  },
];
const SNAPSHOT_ID = "singleton";
const MAX_SNIPPET_CHARS = 120;
const BODY_LOOKUP_BATCH = 100;
/** Newest lone questions sorted per refresh; bounds AI calls and run time. */
const MAX_LONE_TO_SORT = 1000;
const LONE_BATCH_SIZE = 40;
const LONE_PARALLEL_BATCHES = 8;
const MAX_BODY_DISPLAY_CHARS = 3000;
const MIGRATION_HINT =
  "טבלאות הדשבורד חסרות. יש להריץ את migration 010_question_dashboard.sql ב-Supabase.";

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
}

function db() {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

function friendlyError(err: unknown): string {
  const { code, message } = (err ?? {}) as { code?: string; message?: string };
  if (code === "42P01" || code === "PGRST205") return MIGRATION_HINT;
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

function summarizeCluster(
  id: number,
  members: number[],
  threads: ThreadRow[],
  vectors: number[][],
  statuses: QuestionStatus[]
): DashboardCluster {
  const ordered = orderByCentrality(vectors, members);
  const dates = members
    .map((i) => threads[i]!.created_at)
    .filter((d): d is string => Boolean(d))
    .sort();
  return {
    id,
    // Readable until the AI naming step replaces it.
    name: displayTitle(threads[ordered[0]!]!),
    category: FALLBACK_CATEGORY,
    size: members.length,
    unansweredCount: members.filter((i) => statuses[i] === "unanswered").length,
    courseIds: [...new Set(members.map((i) => threads[i]!.course_id))],
    firstAt: dates[0] ?? null,
    lastAt: dates[dates.length - 1] ?? null,
    sampleThreadIds: ordered
      .slice(0, SAMPLES_PER_CLUSTER)
      .map((i) => threads[i]!.campus_thread_id),
  };
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

/** Step 2: cluster in embedding space, then lay out in 3D for display only. */
export async function rebuildDashboardClusters(): Promise<DashboardStepResult> {
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
          .select("thread_id, embedding")
          .order("thread_id", { ascending: true })
          .range(from, to)
      ),
    ]);

    const vectorById = new Map(
      embeddingRows.map((r) => [r.thread_id, parseVector(r.embedding)])
    );
    const embedded = allThreads.filter((t) =>
      vectorById.has(t.campus_thread_id)
    );
    const threads = embedded.slice(0, MAX_DASHBOARD_QUESTIONS);
    const vectors = threads.map((t) => vectorById.get(t.campus_thread_id)!);

    const answeredIds = new Set(answered.map((r) => r.thread_id));
    const statuses = threads.map((t) => statusOf(t, answeredIds));

    const reservedIndex = threads.map((t) =>
      RESERVED_GROUPS.findIndex((g) => g.matches(t.title, t.body_text))
    );
    const questionIndexes = threads.flatMap((_, i) =>
      reservedIndex[i]! < 0 ? [i] : []
    );
    const questionLabels = clusterBySimilarity(
      questionIndexes.map((i) => vectors[i]!),
      SIMILARITY_THRESHOLD
    );
    const firstReservedId = Math.max(-1, ...questionLabels) + 1;
    const labels = reservedIndex.map((index) => firstReservedId + index);
    questionIndexes.forEach((threadIndex, i) => {
      labels[threadIndex] = questionLabels[i]!;
    });

    const positions = await layoutIn3D(vectors);

    const membersByLabel = new Map<number, number[]>();
    labels.forEach((label, i) => {
      if (label >= 0) {
        membersByLabel.set(label, [...(membersByLabel.get(label) ?? []), i]);
      }
    });

    const clusters = [...membersByLabel.entries()]
      .sort(([a], [b]) => a - b)
      .map(([id, members]) => {
        const summary = summarizeCluster(id, members, threads, vectors, statuses);
        const reserved = RESERVED_GROUPS[id - firstReservedId];
        return reserved
          ? {
              ...summary,
              name: reserved.label,
              category: reserved.category ?? reserved.label,
              reserved: true,
            }
          : summary;
      });

    const points: DashboardPoint[] = threads.map((thread, i) => ({
      threadId: thread.campus_thread_id,
      courseId: thread.course_id,
      title: displayTitle(thread),
      snippet: bodySnippet(thread),
      createdAt: thread.created_at,
      status: statuses[i]!,
      clusterId: labels[i]! >= 0 ? labels[i]! : null,
      x: roundCoordinate(positions[i]![0]!),
      y: roundCoordinate(positions[i]![1]!),
      z: roundCoordinate(positions[i]![2]!),
    }));

    await saveSnapshot({
      computedAt: new Date().toISOString(),
      similarityThreshold: SIMILARITY_THRESHOLD,
      totalAvailable: embedded.length,
      named: false,
      clusters,
      points,
    });
    return { ok: true, clusters: clusters.length };
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

const NAMING_PROMPT = [
  "את/ה מנתח/ת שאלות תמיכה טכנית של סטודנטים בקורסים מקוונים.",
  "לכל קבוצה ממוספרת של שאלות דומות, כתוב/כתבי שם קצר בעברית (2 עד 6 מילים) שמתאר את הנושא המשותף.",
  "השם חייב לנבוע מהשאלות בלבד, בלי שמות של אנשים ובלי פרטים אישיים.",
  `אם רוב התגובות בקבוצה הן סטודנטים שמציגים את עצמם ומספרים על עצמם, ולא שאלות טכניות, השם חייב להיות בדיוק "${SELF_INTRO_NAME}", גם אם הן מזכירות נושא כמו שפה.`,
  'החזר/י JSON בלבד בצורה: {"names":[{"i":0,"name":"..."}]}',
].join("\n");

const MERGE_PROMPT = [
  "לפניך שמות ממוספרים של קבוצות שאלות תמיכה טכנית.",
  "מצא/י קבוצות שעוסקות באותו נושא בפועל, גם אם הניסוח שונה, ואחד/י אותן.",
  'דוגמאות לאיחוד: "בעיות בכתוביות" עם "שינוי שפת כתוביות"; "בעיות בסרטונים" עם "וידאו לא פועל"; שתי קבוצות על "בעיה בסימון וי ירוק".',
  "אל תאחד/י נושאים שונים רק כי שניהם קשורים לאותו אזור באתר, למשל תעודה והתקדמות בקורס.",
  "לכל איחוד תן/י שם קצר בעברית (2 עד 6 מילים). קבוצה יכולה להופיע באיחוד אחד לכל היותר, וקבוצות ללא כפילות לא יופיעו.",
  'החזר/י JSON בלבד בצורה: {"merges":[{"name":"...","clusters":[0,5]}]}',
].join("\n");

/** One failed call just leaves the groups separate. */
async function requestMerges(clusters: DashboardCluster[]) {
  try {
    return parseClusterMerges(
      await serverChat({
        messages: [
          {
            role: "user",
            content: clusters.map((c) => `${c.id}: ${c.name}`).join("\n"),
          },
        ],
        systemPrompt: MERGE_PROMPT,
        temperature: 0.1,
        responseFormat: { type: "json_object" },
      })
    );
  } catch {
    return [];
  }
}

const CATEGORY_PROMPT = [
  "לפניך שמות ממוספרים של נושאי שאלות תמיכה טכנית.",
  "שייך/י כל נושא לקטגוריה אחת בדיוק מתוך הרשימה הסגורה הבאה, והשתמש/י בשמות הקטגוריות בדיוק כפי שהם כתובים:",
  ...FIXED_CATEGORIES.map((category) => `- ${category}`),
  `"${NO_ISSUE_CATEGORY}" מיועדת לתגובות שמדווחות שהכול עובד ואין תקלה, גם אם הן נכתבו בהקשר של נושא מסוים.`,
  `נושא בשם "${SELF_INTRO_NAME}" שייך תמיד ל"${FALLBACK_CATEGORY}".`,
  `אסור להמציא קטגוריות חדשות. השתמש/י ב"${FALLBACK_CATEGORY}" רק אם אף קטגוריה אחרת לא מתאימה.`,
  'החזר/י JSON בלבד בצורה: {"categories":[{"name":"...","clusters":[0,1]}]}',
].join("\n");

async function nameBatch(
  batch: DashboardCluster[],
  samplesByThread: Map<string, string>
): Promise<Map<number, string>> {
  const content = batch
    .map((cluster) => {
      const samples = cluster.sampleThreadIds
        .map((id) => samplesByThread.get(id)?.slice(0, MAX_SAMPLE_CHARS))
        .filter(Boolean)
        .map((text) => `- ${text!.replace(/\s+/g, " ")}`);
      return [`קבוצה ${cluster.id}:`, ...samples].join("\n");
    })
    .join("\n\n");

  try {
    return parseClusterNames(
      await serverChat({
        messages: [{ role: "user", content }],
        systemPrompt: NAMING_PROMPT,
        temperature: 0.1,
        responseFormat: { type: "json_object" },
      })
    );
  } catch {
    // One failed batch keeps its readable fallback names.
    return new Map();
  }
}

const LONE_CATEGORY_PROMPT = [
  "לפניך תגובות ממוספרות של סטודנטים בפורום תמיכה טכנית (כותרת ותוכן).",
  "שייך/י כל תגובה לקטגוריה אחת בדיוק מתוך הרשימה הסגורה הבאה, והשתמש/י בשמות הקטגוריות בדיוק כפי שהם כתובים:",
  ...FIXED_CATEGORIES.map((category) => `- ${category}`),
  `"${NO_ISSUE_CATEGORY}" מיועדת לתגובות שמדווחות שהכול עובד ואין תקלה.`,
  `תגובה שבה סטודנט מציג את עצמו ומספר על עצמו, בלי שאלה טכנית, שייכת ל"${FALLBACK_CATEGORY}".`,
  `אסור להמציא קטגוריות חדשות. השתמש/י ב"${FALLBACK_CATEGORY}" רק אם אף קטגוריה אחרת לא מתאימה.`,
  'החזר/י JSON בלבד בצורה: {"names":[{"i":0,"name":"שם הקטגוריה"}]}',
].join("\n");

async function categorizeLoneBatch(
  batch: DashboardPoint[],
  categoryByThread: Map<string, string>
): Promise<boolean> {
  try {
    const answers = parseClusterNames(
      await serverChat({
        messages: [
          {
            role: "user",
            content: batch
              .map((p, i) => `${i}: ${p.title} — ${p.snippet ?? ""}`)
              .join("\n"),
          },
        ],
        systemPrompt: LONE_CATEGORY_PROMPT,
        temperature: 0.1,
        responseFormat: { type: "json_object" },
      })
    );
    answers.forEach((name, i) => {
      const point = batch[i];
      if (point) {
        categoryByThread.set(
          point.threadId,
          toFixedCategory(name, FIXED_CATEGORIES, FALLBACK_CATEGORY)
        );
      }
    });
    return answers.size > 0;
  } catch {
    // Those questions stay ungrouped rather than being filed under a guess.
    return false;
  }
}

async function categorizeLoneQuestions(
  points: DashboardPoint[]
): Promise<{ categoryByThread: Map<string, string>; failed: boolean }> {
  const lone = points
    .filter((p) => p.clusterId === null)
    .slice(0, MAX_LONE_TO_SORT);
  const batches: DashboardPoint[][] = [];
  for (let i = 0; i < lone.length; i += LONE_BATCH_SIZE) {
    batches.push(lone.slice(i, i + LONE_BATCH_SIZE));
  }

  const categoryByThread = new Map<string, string>();
  let failed = false;
  for (let i = 0; i < batches.length; i += LONE_PARALLEL_BATCHES) {
    const results = await Promise.all(
      batches
        .slice(i, i + LONE_PARALLEL_BATCHES)
        .map((batch) => categorizeLoneBatch(batch, categoryByThread))
    );
    failed = failed || results.includes(false);
  }
  return { categoryByThread, failed };
}

/** Step 3: give clusters AI names and sort everything into the fixed categories. */
export async function nameDashboardClusters(): Promise<DashboardStepResult> {
  try {
    const snapshot = await getDashboardSnapshot();
    if (!snapshot) return { ok: false, message: "אין עדיין ניתוח שמור." };

    const toName = snapshot.clusters
      .filter((c) => !c.reserved)
      .slice(0, MAX_CLUSTERS_TO_NAME);
    const sampleIds = toName.flatMap((c) => c.sampleThreadIds);
    const { data, error } = await db()
      .from("question_embeddings")
      .select("thread_id, question_text")
      .in("thread_id", sampleIds);
    if (error) throw error;
    const samplesByThread = new Map(
      ((data ?? []) as { thread_id: string; question_text: string }[]).map(
        (r) => [r.thread_id, r.question_text]
      )
    );

    const batches: DashboardCluster[][] = [];
    for (let i = 0; i < toName.length; i += NAMING_BATCH_SIZE) {
      batches.push(toName.slice(i, i + NAMING_BATCH_SIZE));
    }
    const results = await Promise.all(
      batches.map((batch) => nameBatch(batch, samplesByThread))
    );
    const names = new Map(results.flatMap((m) => [...m]));
    for (const cluster of toName) {
      cluster.name = names.get(cluster.id) ?? cluster.name;
    }

    const merged = mergeClusters(
      snapshot.clusters,
      snapshot.points,
      await requestMerges(toName)
    );
    const namedIds = new Set(toName.map((c) => c.id));
    const namedClusters = merged.clusters.filter((c) => namedIds.has(c.id));

    let categoryFailed = false;
    if (namedClusters.length > 0) {
      try {
        const categories = parseCategoryAssignment(
          await serverChat({
            messages: [
              {
                role: "user",
                content: namedClusters
                  .map((c) => `${c.id}: ${c.name}`)
                  .join("\n"),
              },
            ],
            systemPrompt: CATEGORY_PROMPT,
            temperature: 0.1,
            responseFormat: { type: "json_object" },
          })
        );
        for (const cluster of namedClusters) {
          cluster.category = toFixedCategory(
            categories.get(cluster.id),
            FIXED_CATEGORIES,
            FALLBACK_CATEGORY
          );
        }
        categoryFailed = categories.size === 0;
      } catch {
        categoryFailed = true;
      }
    }

    const missedNames = toName.length - names.size;
    const { categoryByThread, failed: loneFailed } =
      await categorizeLoneQuestions(merged.points);
    const sorted = assignLoneQuestions(
      merged.clusters,
      merged.points,
      categoryByThread
    );

    await saveSnapshot({
      ...snapshot,
      clusters: sorted.clusters,
      points: sorted.points,
      named: !categoryFailed && missedNames === 0,
    });
    return {
      ok: true,
      clusters: namedClusters.length,
      message:
        categoryFailed || missedNames > 0 || loneFailed
          ? "חלק משמות הקבוצות או הקטגוריות לא נוצרו. אפשר לרענן שוב."
          : undefined,
    };
  } catch (err) {
    return { ok: false, message: friendlyError(err) };
  }
}

/** Question bodies for one opened group; kept out of the snapshot to keep it small. */
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
