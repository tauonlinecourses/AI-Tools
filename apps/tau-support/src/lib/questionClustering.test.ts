import { describe, expect, it } from "vitest";
import {
  assignLoneQuestions,
  clusterBySimilarity,
  isNoIssueReply,
  isNonWordComment,
  isSelfIntroduction,
  mergeClusters,
  orderByCentrality,
  parseClusterMerges,
  parseCategoryAssignment,
  parseClusterNames,
  seededRandom,
  shortenAndNormalize,
  toFixedCategory,
} from "./questionClustering";

function unit(v: number[]): number[] {
  return shortenAndNormalize(v, v.length);
}

describe("clusterBySimilarity", () => {
  it("groups close vectors and leaves outliers unlabeled", () => {
    const vectors = [
      unit([1, 0.02, 0]),
      unit([0, 1, 0.02]),
      unit([1, 0, 0.03]),
      unit([0.03, 1, 0]),
      unit([1, 0.04, 0.01]),
      unit([0, 0, 1]),
    ];
    expect(clusterBySimilarity(vectors, 0.9)).toEqual([0, 1, 0, 1, 0, -1]);
  });

  it("returns all -1 when nothing is similar enough", () => {
    expect(clusterBySimilarity([[1, 0], [0, 1]], 0.5)).toEqual([-1, -1]);
  });

  it("handles empty and single inputs", () => {
    expect(clusterBySimilarity([], 0.5)).toEqual([]);
    expect(clusterBySimilarity([[1, 0]], 0.5)).toEqual([-1]);
  });
});

describe("orderByCentrality", () => {
  it("puts the most typical member first", () => {
    const vectors = [unit([1, 0.5]), unit([1, 0]), unit([1, -0.5])];
    expect(orderByCentrality(vectors, [0, 1, 2])[0]).toBe(1);
  });
});

describe("shortenAndNormalize", () => {
  it("cuts and rescales to unit length", () => {
    const out = shortenAndNormalize([3, 4, 100], 2);
    expect(out[0]).toBeCloseTo(0.6);
    expect(out[1]).toBeCloseTo(0.8);
  });
});

describe("seededRandom", () => {
  it("repeats for the same seed", () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    expect([a(), a()]).toEqual([b(), b()]);
  });
});

describe("isNoIssueReply", () => {
  const title = "בעיות טכניות והצעות לשיפור";

  it.each([
    "אין",
    "אין בעיה.",
    "אין בעיות טכניות",
    "אין לי הערות",
    "הכל תקין, תודה",
    "אין תקלות",
    "אין תקלה טכנית",
    "ללא תקלות",
    "לא היו תקלות",
    "עובד",
    "הכל עובד",
    "הכול עובד מצוין!",
    "זה עובד טוב",
    "לא",
    "לא.",
    "לא תודה",
    "לא נתקלתי",
    "לא נתקלתי בבעיות",
    "לא נתקלתי בשום בעיה.",
    "אני לא נתקלתי בבעיות טכניות במהלך הקורס",
    "לא היו לי תקלות",
    "לא נתקלתי בקשיים",
  ])(
    "detects %s",
    (body) => {
      expect(isNoIssueReply(title, body)).toBe(true);
    }
  );

  it("uses the title when there is no body", () => {
    expect(isNoIssueReply("אין בעיה", "")).toBe(true);
  });

  it("keeps real questions, even with a no-issue title", () => {
    expect(isNoIssueReply(title, "אין לי וידאו בשיעור 3")).toBe(false);
    expect(isNoIssueReply("אין", "הסרטון לא נטען אצלי")).toBe(false);
    expect(isNoIssueReply(title, "לא עובד")).toBe(false);
    expect(isNoIssueReply(title, "הכל לא עובד")).toBe(false);
    expect(isNoIssueReply(title, "נתקלתי בבעיות")).toBe(false);
    expect(isNoIssueReply(title, "לא מצאתי את הסרטון")).toBe(false);
    expect(isNoIssueReply(title, "")).toBe(false);
  });
});

describe("isNonWordComment", () => {
  it.each([
    [".", "."],
    ["א", ""],
    ["...", "אאאא"],
    ["123", "!!"],
    ["בעיות טכניות והצעות לשיפור", "."],
  ])("detects title %s with body %s", (title, body) => {
    expect(isNonWordComment(title, body)).toBe(true);
  });

  it("keeps threads with a real word in the title or body", () => {
    expect(isNonWordComment("הסרטון לא עובד", ".")).toBe(false);
    expect(isNonWordComment(".", "הסרטון לא עובד")).toBe(false);
    expect(isNonWordComment("בעיות טכניות", "אין וידאו")).toBe(false);
  });
});

describe("assignLoneQuestions", () => {
  const point = (threadId: string, clusterId: number | null) => ({
    threadId,
    courseId: "c",
    title: threadId,
    createdAt: "2026-01-01",
    status: "unanswered" as const,
    clusterId,
    x: 0,
    y: 0,
    z: 0,
  });

  it("groups lone questions per category and leaves the rest alone", () => {
    const result = assignLoneQuestions(
      [
        {
          id: 4,
          name: "x",
          category: "וידאו",
          size: 2,
          unansweredCount: 0,
          courseIds: [],
          firstAt: null,
          lastAt: null,
          sampleThreadIds: [],
        },
      ],
      [point("a", 4), point("b", null), point("c", null), point("d", null)],
      new Map([
        ["a", "אחר"],
        ["b", "וידאו"],
        ["c", "וידאו"],
      ])
    );
    expect(result.points.map((p) => p.clusterId)).toEqual([4, 5, 5, null]);
    expect(result.clusters[1]).toMatchObject({
      id: 5,
      category: "וידאו",
      size: 2,
      unansweredCount: 2,
      lone: true,
    });
  });
});

describe("isSelfIntroduction", () => {
  it("matches introduction titles only", () => {
    expect(isSelfIntroduction("הצגת עצמי")).toBe(true);
    expect(isSelfIntroduction("היכרות - שלום לכולם")).toBe(true);
    expect(isSelfIntroduction("שפת הקורס")).toBe(false);
    expect(isSelfIntroduction(null)).toBe(false);
  });
});

describe("toFixedCategory", () => {
  it("keeps listed categories and sends anything else to the fallback", () => {
    const allowed = ["וידאו", "אחר"];
    expect(toFixedCategory("וידאו", allowed, "אחר")).toBe("וידאו");
    expect(toFixedCategory("קטגוריה חדשה", allowed, "אחר")).toBe("אחר");
    expect(toFixedCategory(undefined, allowed, "אחר")).toBe("אחר");
  });
});

describe("mergeClusters", () => {
  const cluster = (id: number, size: number, firstAt: string) => ({
    id,
    name: `c${id}`,
    category: "אחר",
    size,
    unansweredCount: 1,
    courseIds: [`course${id}`],
    firstAt,
    lastAt: firstAt,
    sampleThreadIds: [`t${id}`],
  });
  const point = (threadId: string, clusterId: number | null) => ({
    threadId,
    courseId: "c",
    title: threadId,
    createdAt: null,
    status: "answered" as const,
    clusterId,
    x: 0,
    y: 0,
    z: 0,
  });
  const clusters = [
    cluster(0, 2, "2026-03-01"),
    cluster(1, 5, "2026-01-01"),
    cluster(2, 3, "2026-02-01"),
  ];

  it("combines members into the largest and relabels points", () => {
    const result = mergeClusters(
      clusters,
      [point("a", 0), point("b", 1), point("c", null)],
      [{ name: "וידאו", clusterIds: [0, 1] }]
    );
    expect(result.clusters.map((c) => c.id)).toEqual([1, 2]);
    expect(result.clusters[0]).toMatchObject({
      name: "וידאו",
      size: 7,
      unansweredCount: 2,
      firstAt: "2026-01-01",
      lastAt: "2026-03-01",
    });
    expect(result.points.map((p) => p.clusterId)).toEqual([1, 1, null]);
  });

  it("ignores unknown ids and repeated use of a cluster", () => {
    const result = mergeClusters(clusters, [], [
      { name: "x", clusterIds: [0, 99] },
      { name: "y", clusterIds: [1, 2] },
      { name: "z", clusterIds: [2, 0] },
    ]);
    expect(result.clusters.map((c) => [c.id, c.size])).toEqual([
      [1, 8],
      [0, 2],
    ]);
  });

  it("parses merges and tolerates invalid JSON", () => {
    expect(
      parseClusterMerges('{"merges":[{"name":"א","clusters":[1,"x",2]}]}')
    ).toEqual([{ name: "א", clusterIds: [1, 2] }]);
    expect(parseClusterMerges("oops")).toEqual([]);
  });
});

describe("model output parsers", () => {
  it("reads names and ignores malformed rows", () => {
    const names = parseClusterNames(
      '{"names":[{"i":2,"name":" תעודה "},{"i":"x","name":"y"}]}'
    );
    expect([...names]).toEqual([[2, "תעודה"]]);
  });

  it("reads category assignments", () => {
    const cats = parseCategoryAssignment(
      '{"categories":[{"name":"וידאו","clusters":[0,3]}]}'
    );
    expect(cats.get(3)).toBe("וידאו");
  });

  it("returns empty on invalid JSON", () => {
    expect(parseClusterNames("oops").size).toBe(0);
    expect(parseCategoryAssignment("oops").size).toBe(0);
  });
});
