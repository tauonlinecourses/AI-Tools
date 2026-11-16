import {
  ACTIVITY_TYPES,
  QUESTION_TYPE_LABEL,
  SINGLETON_ACTIVITY_TYPES,
  type ComponentType,
  type PageComponent,
  type QuestionType,
} from "./types";

/**
 * A picker item id. Every component type is its own item, except `question`,
 * which has one item per question kind (it inserts a question preset to it).
 */
export type PickerType =
  | Exclude<ComponentType, "question">
  | "question_single"
  | "question_multiple"
  | "question_yes_no";

const QUESTION_ITEMS: Record<Extract<PickerType, `question_${string}`>, QuestionType> = {
  question_single: "single_choice",
  question_multiple: "multiple_choice",
  question_yes_no: "yes_no",
};

/** The page component type a picker item inserts. */
export function componentOf(id: PickerType): ComponentType {
  return id in QUESTION_ITEMS ? "question" : (id as ComponentType);
}

/** The question kind a picker item presets, if it is a question item. */
export function questionTypeOf(id: PickerType): QuestionType | null {
  return QUESTION_ITEMS[id as keyof typeof QUESTION_ITEMS] ?? null;
}

export type CategoryId = "text" | "media" | "inter" | "quiz" | "social";

export const CATEGORIES: { id: CategoryId; label: string; color: string }[] = [
  { id: "text", label: "טקסט ומבנה", color: "#0F6CBF" },
  { id: "media", label: "מדיה", color: "#7A4FD6" },
  { id: "inter", label: "אינטראקטיבי", color: "#C2620A" },
  { id: "quiz", label: "שאלות ובדיקה", color: "#1E8A5A" },
  { id: "social", label: "פעילויות שיתופיות", color: "#C0396B" },
];

export interface CatalogItem {
  /** Picker item id (see `componentOf` for the component type it inserts). */
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
  { type: "video", label: "וידאו", category: "media", description: "סרטון מיוטיוב או מקובץ", keywords: "video movie youtube סרטון סרט" },
  { type: "interactive_video", label: "וידאו אינטרקטיבי", category: "inter", description: "וידאו עם שאלות לאורך הצפייה", keywords: "interactive video h5p סרטון סרט שאלות אינטראקטיבי" },
  { type: "interactive_unit", label: "יחידה אינטראקטיבית", category: "inter", description: "יחידת לימוד אינטראקטיבית", keywords: "interactive unit h5p" },
  { type: "button", label: "כפתור", category: "inter", description: "קישור או מעבר בלחיצה", keywords: "button link cta קישור" },
  { type: "question_single", label: QUESTION_TYPE_LABEL.single_choice, category: "quiz", description: "תשובה נכונה אחת מתוך כמה אפשרויות", keywords: "question quiz single choice mcq שאלה חד ברירה אמריקאית מבחן בוחן" },
  { type: "question_multiple", label: QUESTION_TYPE_LABEL.multiple_choice, category: "quiz", description: "כמה תשובות נכונות מתוך האפשרויות", keywords: "question quiz multiple choice checkbox שאלה רב ברירה מבחן בוחן" },
  { type: "question_yes_no", label: QUESTION_TYPE_LABEL.yes_no, category: "quiz", description: "התלמידים בוחרים נכון או לא נכון", keywords: "question quiz true false yes no שאלה נכון לא נכון מבחן בוחן" },
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
  text: ["image", "video", "question_single"],
  text_unit: ["image", "video", "question_single"],
  image: ["text", "question_single", "video"],
  video: ["question_single", "text", "image"],
  interactive_video: ["question_single", "text", "word_cloud"],
  interactive_unit: ["text", "question_single", "video"],
  button: ["text", "image", "video"],
  question: ["question_single", "question_yes_no", "question_multiple"],
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
  "video",
  "image",
  "question_single",
  "button",
];

/** Display name for a page component type ("שאלה" for any question kind). */
export function componentLabel(t: ComponentType): string {
  return t === "question" ? "שאלה" : catalogItem(t).label;
}

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
    return `כבר יש ${componentLabel(otherKind.type)} בעמוד. ניתן להוסיף רק סוג פעילות אחד בעמוד`;
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

export function pushRecent(t: PickerType): void {
  try {
    const next = [t, ...readRecent().filter((x) => x !== t)].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: recent list just stays empty */
  }
}

export interface ComponentTemplate {
  id: string;
  label: string;
  description: string;
  /** Inserted in this order; activities still land at the bottom of the page. */
  types: PickerType[];
}

export const TEMPLATES: ComponentTemplate[] = [
  {
    id: "lesson-opening",
    label: "פתיחת שיעור",
    description: "טקסט · וידאו · כפתור",
    types: ["text", "video", "button"],
  },
  {
    id: "watch-and-check",
    label: "צפייה ובדיקה",
    description: "וידאו · 2 שאלות",
    types: ["video", "question_single", "question_single"],
  },
  {
    id: "video-with-button",
    label: "וידאו עם כפתור",
    description: "וידאו · כפתור",
    types: ["video", "button"],
  },
  {
    id: "explain-with-image",
    label: "הסבר עם תמונה",
    description: "טקסט · תמונה · טקסט",
    types: ["text", "image", "text"],
  },
  {
    id: "summary-reflection",
    label: "סיכום ורפלקציה",
    description: "טקסט · ענן מילים",
    types: ["text", "word_cloud"],
  },
  {
    id: "discussion",
    label: "דיון",
    description: "טקסט · פורום",
    types: ["text", "forum"],
  },
];

/** Why a template can't be added, checking its activities against the page. */
export function templateLockReason(
  template: ComponentTemplate,
  list: PageComponent[],
  isHome: boolean,
): string | null {
  for (const type of new Set(template.types.map(componentOf))) {
    const reason = lockReason(type, list, isHome);
    if (reason) return reason;
  }
  return null;
}

/** Templates that usually fit after a given block type, best first. */
const TEMPLATE_SUGGESTIONS: Partial<Record<ComponentType | "_start", string[]>> = {
  _start: ["lesson-opening", "video-with-button", "watch-and-check"],
  banner: ["video-with-button", "explain-with-image", "watch-and-check"],
  text: ["video-with-button", "explain-with-image", "watch-and-check"],
  text_unit: ["video-with-button", "explain-with-image", "watch-and-check"],
  image: ["video-with-button", "explain-with-image", "watch-and-check"],
  video: ["video-with-button", "watch-and-check", "summary-reflection"],
  interactive_video: ["video-with-button", "watch-and-check", "summary-reflection"],
  question: ["video-with-button", "explain-with-image", "lesson-opening"],
};

/**
 * Up to `count` templates for the spot after `prev`. Templates that can be
 * added come first; locked ones only fill in when nothing else is left.
 */
export function suggestTemplates(
  prev: ComponentType | null,
  list: PageComponent[],
  isHome: boolean,
  count = 3,
): ComponentTemplate[] {
  const preferred = TEMPLATE_SUGGESTIONS[prev ?? "_start"] ?? TEMPLATE_SUGGESTIONS.text!;
  const ordered = [
    ...preferred.map((id) => TEMPLATES.find((t) => t.id === id)!).filter(Boolean),
    ...TEMPLATES.filter((t) => !preferred.includes(t.id)),
  ];
  const open = ordered.filter((t) => !templateLockReason(t, list, isHome));
  const locked = ordered.filter((t) => templateLockReason(t, list, isHome));
  return [...open, ...locked].slice(0, count);
}

/** Category color for any page component type. */
export function categoryColorFor(type: ComponentType): string {
  const item = CATALOG.find((i) => componentOf(i.type) === type);
  return CATEGORIES.find((c) => c.id === item?.category)?.color ?? "#5B6E82";
}
