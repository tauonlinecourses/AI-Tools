/** Helpers shared by the category test and its scoring step. No I/O. */

/**
 * Short question-like descriptions used by the embeddings-only method. Each
 * question goes to the description it is most similar to. "אחר" and
 * "תגובות ללא תוכן" have none: they are not topics with typical wording.
 */
export const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  "סרטונים ווידאו":
    "הסרטון לא נטען, הווידאו לא מתנגן, נתקע או בלי קול, לא רואים את ההרצאה המצולמת",
  "כתוביות ושפה":
    "אין כתוביות לסרטון, הכתוביות לא מסונכרנות או בשפה הלא נכונה, איך מחליפים שפת כתוביות או שפת ממשק",
  "התקדמות וסימון השלמה":
    "היחידה לא מסומנת כהושלמה, אין וי ירוק אחרי שצפיתי, ההתקדמות בקורס לא מתעדכנת או נשארת על אחוז נמוך",
  "תעודות וסיום קורס":
    "איך מקבלים תעודה, התעודה לא מופיעה אחרי שסיימתי את הקורס, השם בתעודה שגוי, הורדת תעודת סיום",
  "מטלות ובחינות":
    "שאלה על מטלה או מבחן, הבחינה לא נשלחת, התשובה שלי סומנה כשגויה, ציון המטלה לא נכון, מספר ניסיונות",
  "הרשמה, התחברות וחשבון":
    "לא מצליח להתחבר לחשבון, שכחתי סיסמה, בעיה בהרשמה לקורס, לא מקבל מייל אימות, שינוי פרטי משתמש",
  "תוכן הקורס":
    "שאלה על החומר הנלמד בקורס, טעות בתוכן השיעור, קישור או קובץ חסר ביחידה, לא מבין הסבר בקורס",
  "משוב והצעות לשיפור":
    "הצעה לשיפור הקורס, משוב על חוויית הלמידה, היה כדאי להוסיף, אהבתי את הקורס, המלצה לשינוי",
  "אין בעיות":
    "אין לי בעיות טכניות, הכול עובד כמו שצריך, לא נתקלתי בתקלות בקורס",
};

export interface TestRow {
  threadId: string;
  title: string;
  snippet: string;
  current: string;
  mini: string;
  embedding: string;
  embeddingScore: number;
  /** Best score minus second-best: how clearly the embedding picked a category. */
  embeddingMargin: number;
  correct: string;
}

const BOM = String.fromCharCode(0xfeff);

const HEADER = [
  "thread_id",
  "title",
  "snippet",
  "current",
  "mini",
  "embedding",
  "embedding_score",
  "embedding_margin",
  "all_agree",
  "correct_category",
];

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** UTF-8 with BOM so Excel shows Hebrew correctly. */
export function toCsv(rows: TestRow[]): string {
  const lines = rows.map((r) =>
    [
      r.threadId,
      r.title,
      r.snippet,
      r.current,
      r.mini,
      r.embedding,
      r.embeddingScore.toFixed(3),
      r.embeddingMargin.toFixed(3),
      r.current === r.mini && r.mini === r.embedding ? "yes" : "no",
      r.correct,
    ]
      .map(csvCell)
      .join(",")
  );
  return `${BOM}${[HEADER.join(","), ...lines].join("\r\n")}\r\n`;
}

/** Minimal RFC 4180 reader: quoted cells, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(new RegExp(`^${BOM}`), "");

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export function rowsFromCsv(text: string): TestRow[] {
  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  const col = (name: string) => header.indexOf(name);
  return body.map((cells) => {
    const get = (name: string) => cells[col(name)]?.trim() ?? "";
    return {
      threadId: get("thread_id"),
      title: get("title"),
      snippet: get("snippet"),
      current: get("current"),
      mini: get("mini"),
      embedding: get("embedding"),
      embeddingScore: Number(get("embedding_score")) || 0,
      embeddingMargin: Number(get("embedding_margin")) || 0,
      correct: get("correct_category"),
    };
  });
}

export function share(part: number, total: number): string {
  return total === 0 ? "—" : `${Math.round((part / total) * 100)}% (${part}/${total})`;
}

/** Count of rows per category for one method, largest first. */
export function distribution(
  rows: TestRow[],
  pick: (r: TestRow) => string
): [string, number][] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(pick(r), (counts.get(pick(r)) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
}
