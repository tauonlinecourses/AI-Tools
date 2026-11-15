import type { Locale } from "./i18n";

/**
 * Extra info shown in the hub's hover card for each tool.
 *
 * - `addedAt` / `updatedAt` are ISO dates (YYYY-MM-DD). Update `updatedAt`
 *   by hand when a tool ships a notable change.
 * - `video` (optional) is a path under `apps/hub/public/`, e.g. `/tool-previews/<id>.mp4`.
 *   Keep clips short (10–30s), muted, ~720p, and small (under ~5MB).
 *   Leave it out until the clip exists: no video means no video section.
 */
export interface ToolDetails {
  addedAt:   string;
  updatedAt: string;
  video?:    string;
  copy: Record<Locale, { about: string; features: string[] }>;
}

export const toolDetails: Record<string, ToolDetails> = {
  "video-curator": {
    addedAt:   "2026-07-13",
    updatedAt: "2026-11-12",
    copy: {
      en: {
        about:
          "Upload a lecture video, get an AI transcript, and split it into titled sections. Export the result as clips, subtitles, or an editing document.",
        features: [
          "AI transcription and section suggestions",
          "Clip export per section",
          "SRT subtitles and PDF editing notes",
        ],
      },
      he: {
        about:
          "מעלים סרטון הרצאה, מקבלים תמלול אוטומטי ומחלקים אותו לקטעים עם כותרות. את התוצאה אפשר לייצא כקליפים, כתוביות או מסמך עריכה.",
        features: [
          "תמלול והצעות חלוקה לקטעים",
          "ייצוא קליפ לכל קטע",
          "כתוביות SRT ומסמך עריכה ב-PDF",
        ],
      },
    },
  },
  "course-builder": {
    addedAt:   "2026-08-09",
    updatedAt: "2026-11-12",
    copy: {
      en: {
        about:
          "Plan a course's structure and write each page's content in one place. Implementers get a review view that shows exactly what to build in Moodle or edX.",
        features: [
          "Course outline with units and pages",
          "Rich page editor with lessons and questions",
          "Review view for the implementation team",
        ],
      },
      he: {
        about:
          "תכנון מבנה הקורס וכתיבת התוכן של כל עמוד במקום אחד. צוות ההטמעה מקבל תצוגה שמראה בדיוק מה לבנות במודל או ב-edX.",
        features: [
          "מבנה קורס עם יחידות ועמודים",
          "עורך עמודים עם שיעורים ושאלות",
          "תצוגת הטמעה לצוות ההטמעה",
        ],
      },
    },
  },
  "mbz-explorer": {
    addedAt:   "2026-08-11",
    updatedAt: "2026-11-12",
    copy: {
      en: {
        about:
          "Open a Moodle .mbz course backup in the browser and browse its sections, activities, and content without restoring it to Moodle.",
        features: [
          "Course structure tree",
          "Decoded activity and page content",
          "Runs locally in the browser",
        ],
      },
      he: {
        about:
          "פותחים קובץ גיבוי של קורס מודל (MBZ) בדפדפן וצופים ביחידות, בפעילויות ובתוכן בלי לשחזר אותו למודל.",
        features: [
          "עץ מבנה הקורס",
          "תצוגת תוכן הפעילויות והעמודים",
          "עובד מקומית בדפדפן",
        ],
      },
    },
  },
  "tau-support": {
    addedAt:   "2026-09-02",
    updatedAt: "2026-11-12",
    copy: {
      en: {
        about:
          "Pulls new technical-help forum threads from all of the university's Campus IL courses into one view, sorted by category, so staff can answer them faster.",
        features: [
          "New forum threads from every course in one place",
          "Questions grouped by category",
          "AI-drafted answers",
        ],
      },
      he: {
        about:
          "מרכז את השרשורים החדשים בפורומי העזרה הטכנית מכל קורסי האוניברסיטה בקמפוס IL במקום אחד, ממוינים לקטגוריות, כדי שהצוות יענה מהר יותר.",
        features: [
          "שרשורים חדשים מכל הקורסים במקום אחד",
          "שאלות ממוינות לקטגוריות",
          "טיוטות תשובה מבוססות AI",
        ],
      },
    },
  },
  "virtual-support": {
    addedAt:   "2026-10-18",
    updatedAt: "2026-11-12",
    copy: {
      en: {
        about:
          "A chatbot that answers technical-support questions using the organization's own guides and staff documents, with links to the sources it used.",
        features: [
          "Answers grounded in staff documents",
          "Source links for every answer",
          "Browse guides by topic",
        ],
      },
      he: {
        about:
          "צ׳אט-בוט שעונה על שאלות תמיכה טכנית על סמך המדריכים ומסמכי הצוות של הארגון, עם קישורים למקורות שעליהם התבסס.",
        features: [
          "תשובות המבוססות על מסמכי הצוות",
          "קישור למקור בכל תשובה",
          "עיון במדריכים לפי נושא",
        ],
      },
    },
  },
  "dictionary-tool": {
    addedAt:   "2026-10-19",
    updatedAt: "2026-10-19",
    copy: {
      en: {
        about:
          "Turn an Excel glossary with term and definition columns into an XML file you can import straight into a Moodle glossary.",
        features: [
          "Excel upload with preview",
          "Moodle glossary XML export",
        ],
      },
      he: {
        about:
          "הופך קובץ אקסל עם עמודות מושג והגדרה לקובץ XML שאפשר לייבא ישירות למילון מונחים במודל.",
        features: [
          "העלאת אקסל עם תצוגה מקדימה",
          "ייצוא XML למילון מונחים במודל",
        ],
      },
    },
  },
  "video-transcriber": {
    addedAt:   "2026-11-04",
    updatedAt: "2026-11-04",
    copy: {
      en: {
        about:
          "A desktop app that transcribes video files on your computer. This page links to the installer on SharePoint.",
        features: [
          "Download from SharePoint",
          "Step-by-step install guide",
        ],
      },
      he: {
        about:
          "תוכנה לשולחן העבודה שמתמללת קבצי וידאו על המחשב שלך. העמוד מקשר לקובץ ההתקנה ב-SharePoint.",
        features: [
          "הורדה מ-SharePoint",
          "מדריך התקנה צעד אחר צעד",
        ],
      },
    },
  },
};
