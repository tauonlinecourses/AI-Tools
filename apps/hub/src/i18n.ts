export type Locale = "en" | "he";

export const ui = {
  en: {
    title:       "AI Tools",
    subtitle:    "Our homemade AI-powered tools for daily work",
    all:         "All",
    empty:       "No tools in this category yet.",
    comingSoon:  "Coming Soon",
    langLabel:   "עברית",
    langHref:    "/",
    dir:         "ltr" as const,
    htmlLang:    "en",
  },
  he: {
    title:       "כלי בינה מלאכותית",
    subtitle:    "כלים שפותחו על ידי הדקנט, למען הדקנט",
    all:         "הכל",
    empty:       "אין כלים בקטגוריה זו עדיין.",
    comingSoon:  "בקרוב",
    langLabel:   "English",
    langHref:    "/en",
    dir:         "rtl" as const,
    htmlLang:    "he",
  },
} as const;

/** Category key (English, from tools.config) → localized label */
export const categoryLabels: Record<Locale, Record<string, string>> = {
  en: {
    Video:      "Video",
    Education:  "Education",
    Tech:       "Tech",
  },
  he: {
    Video:      "וידאו",
    Education:  "חינוך",
    Tech:       "טכנולוגיה",
  },
};

export const toolCopy: Record<
  string,
  { name: string; description: string }
> = {
  "video-curator": {
    name:        "ניתוח וידאו",
    description: "ניתוח קבצי וידאו ותמלול לקטעים וייצוא קליפים, כתוביות ומסמכי עריכה",
  },
  "course-builder": {
    name:        "פיתוח קורסים",
    description: "פיתוח ובניית מסמכי הטמעה דינאמיים. תצוגת הטמעה עבור צוות ההטמעה",
  },
  "mbz-explorer": {
    name:        "ניתוח קבצי MBZ",
    description: "ניתוח והצגת מבנה ותוכן של קורסי מודל באמצעות קבצי MBZ",
  },
  "tau-support": {
    name:        "תמיכת אוניברסיטת תל אביב",
    description: "עוזר תמיכה מבוסס בינה מלאכותית לסגל ולסטודנטים באוניברסיטת תל אביב",
  },
};

export function localizeCategory(locale: Locale, category: string): string {
  return categoryLabels[locale][category] ?? category;
}

export function localizeTool(
  locale: Locale,
  tool: { id: string; name: string; description: string },
): { name: string; description: string } {
  if (locale === "en") return { name: tool.name, description: tool.description };
  const he = toolCopy[tool.id];
  return he ?? { name: tool.name, description: tool.description };
}
