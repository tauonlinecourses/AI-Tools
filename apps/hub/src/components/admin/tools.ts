import { PLATFORM_TOOL_IDS } from "@workspace/auth/client";
import type { Locale } from "../../i18n";

/** Tools shown in the group create/edit form (excludes internal/dev starter). */
export const GROUP_FORM_TOOL_IDS = PLATFORM_TOOL_IDS.filter(
  (id) => id !== "tool-starter"
);

const TOOL_LABELS: Record<string, { he: string; en: string }> = {
  "video-curator": { he: "ניתוח וידאו", en: "Video Curator" },
  "course-builder": { he: "פיתוח קורסים", en: "Course Builder" },
  "mbz-explorer": { he: "ניתוח MBZ", en: "MBZ Explorer" },
  "tau-support": { he: "תמיכה טכנית", en: "TAU Support" },
  "dictionary-tool": { he: "מילון מונחים", en: "Dictionary Tool" },
};

export function toolLabel(locale: Locale, toolId: string): string {
  const labels = TOOL_LABELS[toolId];
  if (!labels) return toolId;
  return locale === "he" ? labels.he : labels.en;
}
