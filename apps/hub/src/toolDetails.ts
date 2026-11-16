import type { Locale } from "./i18n";

/**
 * Extra info shown in the hub's hover card for each tool.
 *
 * - `addedAt` / `updatedAt` are ISO dates (YYYY-MM-DD). Update `updatedAt`
 *   by hand when a tool ships a notable change.
 * - `video` (optional) is a path under `apps/hub/public/`, e.g. `/tool-previews/<id>.mp4`.
 *   Keep clips short (10–30s), muted, ~720p, and small (under ~5MB).
 *   Leave it out until the clip exists: no video means no video section.
 * - `image` (optional) is a screenshot under `apps/hub/public/tools images/`.
 *   Shown at the top of the card when there is no video. Wide images (~2:1) fit best.
 */
export interface ToolDetails {
  addedAt:   string;
  updatedAt: string;
  video?:    string;
  image?:    string;
  copy: Record<Locale, { about: string; features: string[] }>;
}

export const toolDetails: Record<string, ToolDetails> = {
  "video-curator": {
    addedAt:   "2026-07-13",
    updatedAt: "2026-11-12",
    image:     "/tools images/video curator.png",
    copy: {
      en: {
        about:
          "Splits a video's transcript into titled sections with AI, then exports clips, SRT subtitles, and a PDF.",
        features: [
          "Video + SRT upload, or a YouTube link",
          "AI splits the transcript into titled sections",
          "Edit and reorder sections on a timeline",
          "Export clips, SRT subtitles, or a PDF",
        ],
      },
      he: {
        about:
          "מחלק תמלול של סרטון לפרקים בעזרת AI ומייצא קליפים, כתוביות SRT ו-PDF.",
        features: [
          "העלאת וידאו + SRT, או קישור YouTube",
          "חלוקה אוטומטית של התמלול לפרקים עם כותרות",
          "עריכה והזזה של פרקים על ציר הזמן",
          "ייצוא קליפים, כתוביות SRT או PDF",
        ],
      },
    },
  },
  "course-builder": {
    addedAt:   "2026-08-09",
    updatedAt: "2026-11-12",
    image:     "/tools images/course builder.png",
    copy: {
      en: {
        about:
          "A platform for writing implementation documents for course developers, lecturers, and teaching assistants, with an implementation view that streamlines building the course in Moodle/edX for the learning-systems team.",
        features: [
          "Course structure: lessons → pages",
          "Pages built from a component library, with statuses",
          "Implementation view to mark what's already built on each platform",
          "Moodle MBZ import/export and local backup",
        ],
      },
      he: {
        about:
          "פלטפורמה ליצירת מסמכי הטמעה עבור מפתחי קורסים, מרצים ועוזרי הוראה, עם תצוגת הטמעה על מנת ליעל את תהליך ההטמעה ויישום לצוות מערכות למידה בפלטפורמות Moodle/edX.",
        features: [
          "מבנה קורס: שיעורים ← עמודים",
          "בניית עמודים ממאגר רכיבים וסימון סטטוס",
          "תצוגת הטמעה לסימון מה כבר הוטמע בכל פלטפורמה",
          "ייבוא וייצוא MBZ של Moodle וגיבוי מקומי",
        ],
      },
    },
  },
  "mbz-explorer": {
    addedAt:   "2026-08-11",
    updatedAt: "2026-11-12",
    image:     "/tools images/mbz explorer.png",
    copy: {
      en: {
        about:
          "View a Moodle course backup (.mbz) in the browser — structure, activities, and decoded content.",
        features: [
          "Opens in the browser only, no server",
          "Course structure tree of sections and activities",
          "Decoded content for each activity",
        ],
      },
      he: {
        about:
          "צפייה בגיבוי קורס של Moodle (.mbz) בדפדפן — מבנה, פעילויות ותוכן מפוענח.",
        features: [
          "נפתח בדפדפן בלבד, בלי שרת",
          "עץ מבנה הקורס: פרקים ופעילויות",
          "תצוגת התוכן המפוענח של כל פעילות",
        ],
      },
    },
  },
  "tau-support": {
    addedAt:   "2026-09-02",
    updatedAt: "2026-11-12",
    image:     "/tools images/tau support.png",
    copy: {
      en: {
        about:
          "Gathers technical-support forum posts from all Tel Aviv University courses and suggests AI-drafted answers based on knowledge documents and previous answers.",
        features: [
          "New threads and replies from every course in one place",
          "Similar questions and a draft answer for each question",
          "Questions dashboard with categories and trends",
          "Knowledge documents edited inside the tool",
        ],
      },
      he: {
        about:
          "מרכז את הודעות פורומי התמיכה הטכנית מכל הקורסים של אוניברסיטת תל אביב בפלטפורמת קמפוס IL ומציע טיוטות תשובה מבוססות מסמכי ידע ותשובות קודמות באמצעות AI.",
        features: [
          "שרשורים ותגובות חדשים מכל הקורסים במקום אחד",
          "שאלות דומות וטיוטת תשובה לכל שאלה",
          "דשבורד שאלות עם קטגוריות ומגמות",
          "עריכת מסמכי המידע מתוך הכלי",
        ],
      },
    },
  },
  "virtual-support": {
    addedAt:   "2026-10-18",
    updatedAt: "2026-11-12",
    image:     "/tools images/virtual support.png",
    copy: {
      en: {
        about:
          "A knowledge base for the support team, with Q&A grounded in sources and citations.",
        features: [
          "Knowledge documents organized in folders and pages",
          "Chat answers built only from the documents, with citations",
          "Click a citation to open the document",
        ],
      },
      he: {
        about:
          "מאגר ידע לצוות התמיכה עם שאלות ותשובות מבוססות מקורות וציטוטים.",
        features: [
          "מסמכי ידע מסודרים לפי תיקיות ועמודים",
          "תשובות בצ׳אט רק מתוך המסמכים, עם ציטוטים",
          "לחיצה על ציטוט פותחת את המסמך",
        ],
      },
    },
  },
  "dictionary-tool": {
    addedAt:   "2026-10-19",
    updatedAt: "2026-10-19",
    image:     "/tools images/dictionary tool.png",
    copy: {
      en: {
        about:
          "Converts an Excel file of terms and definitions into an XML file for importing a glossary into Moodle.",
        features: [
          "Excel upload with term and definition columns",
          "Preview of the terms",
          "XML download for a Moodle glossary activity",
        ],
      },
      he: {
        about:
          "ממיר קובץ Excel של מונחים והגדרות לקובץ XML לייבוא מילון ב-Moodle.",
        features: [
          "העלאת Excel עם העמודות מושג והגדרה",
          "תצוגה מקדימה של המונחים",
          "הורדת XML לפעילות מילון ב-Moodle",
        ],
      },
    },
  },
  "video-transcriber": {
    addedAt:   "2026-11-04",
    updatedAt: "2026-11-04",
    image:     "/tools images/video transcriber.png",
    copy: {
      en: {
        about:
          "Download page and install guide for the desktop Video Transcriber, stored on SharePoint.",
        features: [
          "Download from SharePoint",
          "Step-by-step install guide",
          "Desktop shortcut created on install",
        ],
      },
      he: {
        about:
          "דף הורדה והוראות התקנה לתוכנת מתמלל הוידאו השולחנית, שנשמרת ב-SharePoint.",
        features: [
          "הורדה מ-SharePoint",
          "מדריך התקנה צעד אחר צעד",
          "קיצור דרך בשולחן העבודה אחרי ההתקנה",
        ],
      },
    },
  },
};
