import { describe, expect, it } from "vitest";
import {
  isNoIssueReply,
  isNonWordComment,
  isSelfIntroduction,
  parseIndexedAnswers,
  seededRandom,
  shortenAndNormalize,
  toFixedCategory,
} from "./questionClustering";

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

describe("model output parsers", () => {
  it("reads indexed answers and ignores malformed rows", () => {
    const names = parseIndexedAnswers(
      '{"names":[{"i":2,"name":" תעודה "},{"i":"x","name":"y"}]}'
    );
    expect([...names]).toEqual([[2, "תעודה"]]);
  });

  it("returns empty on invalid JSON", () => {
    expect(parseIndexedAnswers("oops").size).toBe(0);
  });
});
