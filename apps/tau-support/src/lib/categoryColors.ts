/**
 * The dashboard's closed category list, each with a permanent color.
 * Add or rename categories here: the AI sorting uses these same names.
 */
export const CATEGORY_COLORS: Record<string, string> = {
  "סרטונים ווידאו": "#2a78d6",
  "כתוביות ושפה": "#eb6834",
  "התקדמות וסימון השלמה": "#1baf7a",
  "תעודות וסיום קורס": "#eda100",
  "מטלות ובחינות": "#e87ba4",
  "הרשמה, התחברות וחשבון": "#008300",
  "תוכן הקורס": "#6250d6",
  "משוב והצעות לשיפור": "#e34948",
  "אין בעיות": "#0e7490",
  "תגובות ללא תוכן": "#8a6a4f",
  "אחר": "#a8a7a0",
};

/** For categories no longer in the list, e.g. in an older saved analysis. */
export const OTHER_CATEGORY_COLOR = "#a8a7a0";

export function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? OTHER_CATEGORY_COLOR;
}
