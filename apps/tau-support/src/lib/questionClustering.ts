/**
 * Pure helpers for grouping similar student questions. No I/O, so they can be
 * unit-tested and run on the server only.
 */

import type { DashboardCluster, DashboardPoint } from "./dashboardTypes.js";

/** OpenAI's text-embedding-3 vectors stay valid when cut short and re-normalized. */
export function shortenAndNormalize(vector: number[], dims: number): number[] {
  const cut = vector.slice(0, dims);
  const norm = Math.sqrt(cut.reduce((sum, v) => sum + v * v, 0));
  return norm === 0 ? cut : cut.map((v) => v / norm);
}

function pairwiseDistances(vectors: number[][]): Float32Array {
  const n = vectors.length;
  const dims = vectors[0]?.length ?? 0;
  const flat = new Float32Array(n * dims);
  vectors.forEach((v, i) => flat.set(v, i * dims));

  const dist = new Float32Array(n * n);
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      let dot = 0;
      for (let d = 0; d < dims; d += 1) {
        dot += flat[i * dims + d]! * flat[j * dims + d]!;
      }
      dist[i * n + j] = 1 - dot;
      dist[j * n + i] = 1 - dot;
    }
  }
  return dist;
}

interface Merge {
  a: number;
  b: number;
  distance: number;
}

/** Average-linkage merges via the nearest-neighbor chain algorithm (O(n²)). */
function averageLinkageMerges(vectors: number[][]): Merge[] {
  const n = vectors.length;
  const dist = pairwiseDistances(vectors);
  const size = new Int32Array(n).fill(1);
  const active = new Uint8Array(n).fill(1);
  const merges: Merge[] = [];
  const chain: number[] = [];
  let remaining = n;

  while (remaining > 1) {
    if (chain.length === 0) chain.push(active.indexOf(1));
    const a = chain[chain.length - 1]!;
    const previous = chain.length > 1 ? chain[chain.length - 2]! : -1;

    // Starting from `previous` makes ties resolve to it, so the chain ends.
    let nearest = previous;
    let best = previous >= 0 ? dist[a * n + previous]! : Infinity;
    for (let k = 0; k < n; k += 1) {
      if (active[k] && k !== a && dist[a * n + k]! < best) {
        best = dist[a * n + k]!;
        nearest = k;
      }
    }

    if (nearest !== previous) {
      chain.push(nearest);
      continue;
    }

    chain.length -= 2;
    merges.push({ a, b: nearest, distance: best });
    const sizeA = size[a]!;
    const sizeB = size[nearest]!;
    for (let k = 0; k < n; k += 1) {
      if (!active[k] || k === a || k === nearest) continue;
      const merged =
        (sizeA * dist[a * n + k]! + sizeB * dist[nearest * n + k]!) /
        (sizeA + sizeB);
      dist[a * n + k] = merged;
      dist[k * n + a] = merged;
    }
    size[a] = sizeA + sizeB;
    active[nearest] = 0;
    remaining -= 1;
  }
  return merges;
}

/**
 * Group unit vectors by average-linkage clustering, stopping once groups would
 * be less similar than `minSimilarity`.
 *
 * Returns one label per vector: 0 is the largest group, and -1 means the
 * question has no similar partner.
 */
export function clusterBySimilarity(
  vectors: number[][],
  minSimilarity: number
): number[] {
  const n = vectors.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root]!;
    while (parent[x] !== root) {
      const next = parent[x]!;
      parent[x] = root;
      x = next;
    }
    return root;
  };

  // Average linkage is monotonic, so keeping merges under the cut is safe.
  const maxDistance = 1 - minSimilarity;
  for (const { a, b, distance } of averageLinkageMerges(vectors)) {
    if (distance <= maxDistance) parent[find(a)] = find(b);
  }

  const members = new Map<number, number[]>();
  for (let i = 0; i < n; i += 1) {
    const root = find(i);
    members.set(root, [...(members.get(root) ?? []), i]);
  }

  const groups = [...members.values()]
    .filter((m) => m.length >= 2)
    .sort((x, y) => y.length - x.length || x[0]! - y[0]!);

  const labels = new Array<number>(n).fill(-1);
  groups.forEach((group, label) => {
    for (const i of group) labels[i] = label;
  });
  return labels;
}

/** Indexes of `memberIndexes`, most typical (closest to the center) first. */
export function orderByCentrality(
  vectors: number[][],
  memberIndexes: number[]
): number[] {
  const dims = vectors[memberIndexes[0]!]?.length ?? 0;
  const center = new Array<number>(dims).fill(0);
  for (const i of memberIndexes) {
    vectors[i]!.forEach((v, d) => {
      center[d] += v;
    });
  }
  const score = (i: number) =>
    vectors[i]!.reduce((sum, v, d) => sum + v * center[d]!, 0);
  return [...memberIndexes].sort((a, b) => score(b) - score(a));
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

const LONE_GROUP_NAME = "שאלות בודדות";
const LONE_SAMPLE_COUNT = 5;

/**
 * Collect ungrouped questions that have a category into one "lone" group per
 * category. Questions without a category stay ungrouped.
 */
export function assignLoneQuestions(
  clusters: DashboardCluster[],
  points: DashboardPoint[],
  categoryByThread: Map<string, string>
): { clusters: DashboardCluster[]; points: DashboardPoint[] } {
  let nextId = Math.max(-1, ...clusters.map((c) => c.id)) + 1;
  const idByCategory = new Map<string, number>();
  const nextPoints = points.map((point) => {
    const category = categoryByThread.get(point.threadId);
    if (point.clusterId !== null || !category) return point;
    if (!idByCategory.has(category)) idByCategory.set(category, nextId++);
    return { ...point, clusterId: idByCategory.get(category)! };
  });

  const loneClusters = [...idByCategory].map(([category, id]) => {
    const members = nextPoints.filter((p) => p.clusterId === id);
    const dates = members.flatMap((m) => m.createdAt ?? []).sort();
    return {
      id,
      name: LONE_GROUP_NAME,
      category,
      size: members.length,
      unansweredCount: members.filter((m) => m.status === "unanswered").length,
      courseIds: [...new Set(members.map((m) => m.courseId))],
      firstAt: dates[0] ?? null,
      lastAt: dates[dates.length - 1] ?? null,
      sampleThreadIds: members
        .slice(0, LONE_SAMPLE_COUNT)
        .map((m) => m.threadId),
      lone: true,
    };
  });

  return { clusters: [...clusters, ...loneClusters], points: nextPoints };
}

export interface ClusterMerge {
  name: string;
  clusterIds: number[];
}

/** Tolerant reader for `{ "merges": [{ "name": "...", "clusters": [0, 5] }] }`. */
export function parseClusterMerges(raw: string): ClusterMerge[] {
  try {
    const parsed = JSON.parse(raw) as { merges?: unknown };
    if (!Array.isArray(parsed.merges)) return [];
    return (parsed.merges as { name?: unknown; clusters?: unknown }[]).flatMap(
      (row) =>
        typeof row.name === "string" && Array.isArray(row.clusters)
          ? [
              {
                name: row.name.trim().slice(0, 80),
                clusterIds: row.clusters.filter(
                  (id): id is number => typeof id === "number"
                ),
              },
            ]
          : []
    );
  } catch {
    return [];
  }
}

function combineClusters(
  members: DashboardCluster[],
  name: string
): DashboardCluster {
  const firstDates = members.flatMap((c) => c.firstAt ?? []).sort();
  const lastDates = members.flatMap((c) => c.lastAt ?? []).sort();
  return {
    ...members[0]!,
    name: name || members[0]!.name,
    size: members.reduce((sum, c) => sum + c.size, 0),
    unansweredCount: members.reduce((sum, c) => sum + c.unansweredCount, 0),
    courseIds: [...new Set(members.flatMap((c) => c.courseIds))],
    firstAt: firstDates[0] ?? null,
    lastAt: lastDates[lastDates.length - 1] ?? null,
    sampleThreadIds: members
      .flatMap((c) => c.sampleThreadIds)
      .slice(0, members[0]!.sampleThreadIds.length),
  };
}

/**
 * Apply same-topic merges. Unknown ids are ignored and a cluster can only be
 * merged once, so malformed model output cannot lose questions. The largest
 * member keeps its id.
 */
export function mergeClusters(
  clusters: DashboardCluster[],
  points: DashboardPoint[],
  merges: ClusterMerge[]
): { clusters: DashboardCluster[]; points: DashboardPoint[] } {
  const byId = new Map(clusters.map((c) => [c.id, c]));
  const used = new Set<number>();
  const replacedBy = new Map<number, number>();
  const combined = new Map<number, DashboardCluster>();

  for (const merge of merges) {
    const members = [...new Set(merge.clusterIds)]
      .filter((id) => byId.has(id) && !used.has(id))
      .map((id) => byId.get(id)!)
      .sort((a, b) => b.size - a.size);
    if (members.length < 2) continue;

    const target = members[0]!;
    for (const member of members) {
      used.add(member.id);
      if (member.id !== target.id) replacedBy.set(member.id, target.id);
    }
    combined.set(target.id, combineClusters(members, merge.name));
  }

  return {
    clusters: clusters
      .filter((c) => !replacedBy.has(c.id))
      .map((c) => combined.get(c.id) ?? c)
      .sort((a, b) => b.size - a.size),
    points: points.map((p) =>
      p.clusterId !== null && replacedBy.has(p.clusterId)
        ? { ...p, clusterId: replacedBy.get(p.clusterId)! }
        : p
    ),
  };
}

/** Tolerant reader for model JSON: `[{ "i": 0, "name": "..." }]` under `names`. */
export function parseClusterNames(raw: string): Map<number, string> {
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

/** Tolerant reader for `{ "categories": [{ "name": "...", "clusters": [0] }] }`. */
export function parseCategoryAssignment(raw: string): Map<number, string> {
  const out = new Map<number, string>();
  try {
    const parsed = JSON.parse(raw) as { categories?: unknown };
    if (!Array.isArray(parsed.categories)) return out;
    for (const row of parsed.categories as {
      name?: unknown;
      clusters?: unknown;
    }[]) {
      if (typeof row.name !== "string" || !Array.isArray(row.clusters)) continue;
      const name = row.name.trim();
      if (!name) continue;
      for (const id of row.clusters) {
        if (typeof id === "number") out.set(id, name.slice(0, 40));
      }
    }
  } catch {
    return new Map();
  }
  return out;
}
