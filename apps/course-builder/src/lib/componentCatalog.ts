import {
  ACTIVITY_TYPES,
  SINGLETON_ACTIVITY_TYPES,
  type ComponentType,
  type PageComponent,
} from "./types";

/** One entry per type the picker can insert. `interactive_video` is a mode of `video`. */
export type PickerType = Exclude<ComponentType, "interactive_video">;

export type CategoryId = "text" | "media" | "inter" | "quiz" | "social";

export const CATEGORIES: { id: CategoryId; label: string; color: string }[] = [
  { id: "text", label: "טקסט ומבנה", color: "#0F6CBF" },
  { id: "media", label: "מדיה", color: "#7A4FD6" },
  { id: "inter", label: "אינטראקטיבי", color: "#C2620A" },
  { id: "quiz", label: "שאלות ובדיקה", color: "#1E8A5A" },
  { id: "social", label: "פעילויות שיתופיות", color: "#C0396B" },
];

export interface CatalogItem {
  type: PickerType;
  label: string;
  description: string;
  category: CategoryId;
  /** Extra search words (English names, synonyms). */
  keywords: string;
}

export const CATALOG: CatalogItem[] = [
  { type: "text", label: "טקסט", category: "text", description: "פסקת טקסט עשיר עם עיצוב בסיסי", keywords: "text paragraph rich פסקה" },
  { type: "text_unit", label: "יחידת טקסט", category: "text", description: "טקסט ארוך עם כותרת ומבנה", keywords: "text unit article מאמר" },
  { type: "banner", label: "באנר", category: "text", description: "כותרת בולטת עם תמונת רקע", keywords: "banner hero header כותרת" },
  { type: "image", label: "תמונה", category: "media", description: "תמונה עם כיתוב", keywords: "image picture photo img" },
  { type: "video", label: "וידאו", category: "media", description: "סרטון מיוטיוב, מקובץ, או וידאו אינטרקטיבי", keywords: "video movie youtube סרטון סרט interactive אינטרקטיבי h5p" },
  { type: "interactive_unit", label: "יחידה אינטראקטיבית", category: "inter", description: "יחידת לימוד אינטראקטיבית", keywords: "interactive unit h5p" },
  { type: "button", label: "כפתור", category: "inter", description: "קישור או מעבר בלחיצה", keywords: "button link cta קישור" },
  { type: "question", label: "שאלה", category: "quiz", description: "שאלה עם תשובות לבחירה, נכון/לא נכון ועוד", keywords: "question quiz mcq מבחן בוחן" },
  { type: "notes_board", label: "לוח פתקים", category: "social", description: "התלמידים מוסיפים פתקים ללוח", keywords: "notes board padlet פתק" },
  { type: "word_cloud", label: "ענן מילים", category: "social", description: "תשובות קצרות שמתחברות לענן", keywords: "word cloud wordcloud mentimeter" },
  { type: "forum", label: "פורום", category: "social", description: "דיון פתוח בין התלמידים", keywords: "forum discussion דיון" },
];

export const catalogItem = (type: PickerType): CatalogItem =>
  CATALOG.find((i) => i.type === type)!;

/** What usually comes next after a given block type. */
const SUGGESTIONS: Partial<Record<ComponentType | "_start", PickerType[]>> = {
  _start: ["banner", "text", "video"],
  banner: ["text", "video", "image"],
  text: ["image", "video", "question"],
  text_unit: ["image", "video", "question"],
  image: ["text", "question", "video"],
  video: ["question", "text", "image"],
  interactive_video: ["question", "text", "word_cloud"],
  interactive_unit: ["text", "question", "video"],
  button: ["text", "image", "video"],
  question: ["question", "text", "image"],
  notes_board: ["text", "image", "video"],
  word_cloud: ["text", "image", "video"],
  forum: ["text", "image", "video"],
};

export function suggestionsAfter(prev: ComponentType | null): PickerType[] {
  return SUGGESTIONS[prev ?? "_start"] ?? SUGGESTIONS._start!;
}

/** Most-used order for the quick bar's "common" row. */
export const POPULAR: PickerType[] = [
  "text",
  "image",
  "video",
  "question",
  "banner",
  "text_unit",
  "button",
  "interactive_unit",
  "notes_board",
  "word_cloud",
  "forum",
];

const LABEL = (t: ComponentType) =>
  t === "interactive_video" ? "וידאו אינטרקטיבי" : catalogItem(t as PickerType).label;

/** Why `type` can't be added to this page, or null when it can. */
export function lockReason(
  type: ComponentType,
  list: PageComponent[],
  isHome: boolean,
): string | null {
  if (!ACTIVITY_TYPES.has(type)) return null;
  if (isHome) return "לא ניתן להוסיף פעילויות לדף הבית";
  const otherKind = list.find((c) => ACTIVITY_TYPES.has(c.type) && c.type !== type);
  if (otherKind) {
    return `כבר יש ${LABEL(otherKind.type)} בעמוד. ניתן להוסיף רק סוג פעילות אחד בעמוד`;
  }
  if (SINGLETON_ACTIVITY_TYPES.has(type) && list.some((c) => c.type === type)) {
    return "רכיב זה כבר קיים בעמוד";
  }
  return null;
}

/** Search the catalog; items whose label starts with the query rank first. */
export function searchCatalog(query: string): CatalogItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const catLabel = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)!.label;
  return CATALOG.filter((i) =>
    `${i.label} ${i.keywords} ${i.type} ${catLabel(i.category)}`.toLowerCase().includes(q),
  )
    .map((i) => ({ i, s: i.label.startsWith(q) ? 0 : i.label.includes(q) ? 1 : 2 }))
    .sort((a, b) => a.s - b.s)
    .map((x) => x.i);
}

const RECENT_KEY = "course-builder:recent-component-types";

export function readRecent(): PickerType[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter((t): t is PickerType => CATALOG.some((i) => i.type === t)).slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

export function pushRecent(type: ComponentType): void {
  const t: PickerType = type === "interactive_video" ? "video" : type;
  try {
    const next = [t, ...readRecent().filter((x) => x !== t)].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: recent list just stays empty */
  }
}
