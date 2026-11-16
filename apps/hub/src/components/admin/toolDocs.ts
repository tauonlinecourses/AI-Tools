/**
 * Technical handover docs for each tool, shown in the admin "תיעוד כלים" tab.
 * Hebrew only. Keep each entry short — essentials for whoever maintains the project next.
 *
 * Links set to `null` are still missing: fill in the Vercel / Supabase dashboard URLs
 * (Vercel → project → copy URL; Supabase → project → copy URL from the dashboard).
 * "Groups with access" is not stored here — it is read live from the platform groups.
 */

export type ToolDocDatabase = {
  /** Which Supabase project, in Hebrew. */
  name: string;
  /** What the tool keeps there. */
  note: string;
  /** Supabase dashboard URL of the project. `null` = not filled in yet. */
  dashboardUrl: string | null;
};

export type ToolDoc = {
  /** Matches the platform tool id (used to find groups with access). `hub` is the launcher itself. */
  id: string;
  nameHe: string;
  purpose: string;
  workflow: string[];
  /** Live address users open. */
  liveUrl: string;
  /** How it is deployed, in one line. */
  hosting: string;
  /** Vercel dashboard URL of the project that serves it. `null` = not filled in yet. */
  vercelProjectUrl: string | null;
  /** Folder in the monorepo. */
  repoPath: string;
  /** Empty = the tool keeps no data of its own. */
  databases: ToolDocDatabase[];
  /** Shown instead of the live group list (for the hub, which every approved user can open). */
  accessNote?: string;
  /** Short folder tree (monospace). */
  structure: string;
  /**
   * Only for entries missing from `src/toolDetails.ts` (the hub itself).
   * Tools take their added / updated dates from `toolDetails.ts`, shared with the hover card.
   */
  addedAt?: string;
  updatedAt?: string;
};

const HUB_URL = "https://ai-tools-tauonline.vercel.app";
const HUB_VERCEL_PROJECT = "https://vercel.com/tauonlinecourses-projects/ai-tools";
const PLATFORM_SUPABASE = "https://supabase.com/dashboard/project/qpctlsahnyarmrmeplpl";

/** The whole monorepo — every tool lives in it. */
export const REPO_URL = "https://github.com/tauonlinecourses/AI-Tools";

/** Platform login, users, groups and permissions — shared by every tool. */
const PLATFORM_DB: ToolDocDatabase = {
  name: "פרויקט הפלטפורמה (Course Builder)",
  note: "משתמשים, צוותים והרשאות לכלים — משותף לכל הכלים.",
  dashboardUrl: PLATFORM_SUPABASE,
};

export const TOOL_DOCS: ToolDoc[] = [
  {
    id: "hub",
    nameHe: "פלטפורמת הכלים (Hub)",
    purpose:
      "דף הבית של הפלטפורמה: מסך התחברות, רשימת הכלים לפי הרשאות, ואזור הניהול של משתמשים וצוותים.",
    workflow: [
      "המשתמש נרשם או מוזמן על ידי מנהל, לאחר שנוצר משתמש מנהל מאשר אותו ומשייך אותו לצוותים.",
      "לאחר התחברות מוצגים רק כלים עם גישה לצוותים שהמשתמש שייך אליהם.",
      "כלי חיצוני נפתח עם העברת התחברות (handoff); כלי פנימי נפתח בתוך אתר פלטפורמת הכלים.",
      "באזור הניהול מנהלים משתמשים, צוותים והרשאות לכלים.",
    ],
    liveUrl: HUB_URL,
    hosting:
      "פרויקט Vercel נפרד. מארח גם את MBZ Explorer, מילון המונחים ומתמלל הוידאו שאינם זקוקים לפרויקט נפרד.",
    vercelProjectUrl: HUB_VERCEL_PROJECT,
    repoPath: "apps/hub",
    databases: [PLATFORM_DB],
    accessNote: "כל משתמש מאושר. אזור הניהול — מנהלים בלבד.",
    addedAt: "2026-07-13",
    updatedAt: "2026-11-16",
    structure: `apps/hub/
├── api/                 ← פונקציות Vercel (admin, register, auth-handoff…)
├── server/admin/        ← לוגיקת ניהול משתמשים וצוותים בצד השרת
├── src/
│   ├── tools.config.ts  ← רשימת הכלים שמוצגים בדף הבית
│   ├── App.tsx          ← נתיבים (כולל כלים מתארחים)
│   ├── components/      ← HubPage, AdminPage, דפי התחברות
│   │   └── admin/       ← טבלאות, חלונות ותיעוד הכלים (הקובץ הזה)
│   └── lib/             ← adminApi, registerApi, openTool
└── vercel.json`,
  },
  {
    id: "video-curator",
    nameHe: "ניתוח וידאו (Video Curator)",
    purpose:
      "מחלק תמלול של סרטון לפרקים בעזרת AI ומייצא קליפים, כתוביות SRT ו-PDF.",
    workflow: [
      "מעלים קובץ וידאו + SRT, או מדביקים קישור YouTube לשליפת התמלול.",
      "ה-AI מחלק את התמלול לפרקים עם כותרות.",
      "עורכים, ממזגים ומזיזים פרקים על ציר הזמן.",
      "מייצאים קליפים, קובץ SRT או PDF של התמלול.",
    ],
    liveUrl: "https://ai-tools-video-curator.vercel.app",
    hosting: "פרויקט Vercel נפרד, נפתח מהרכזת עם העברת התחברות.",
    vercelProjectUrl: "https://vercel.com/tauonlinecourses-projects/video-curator",
    repoPath: "apps/video-curator",
    databases: [],
    structure: `apps/video-curator/
├── api/
│   ├── chat.ts                ← קריאות AI (דרך ai-client)
│   └── youtube-transcript.ts  ← שליפת תמלול מ-YouTube
├── server/youtubeTranscriptCore.ts
└── src/
    ├── components/  ← נגן, ציר זמן, תמלול, ניהול פרקים
    └── lib/         ← segmentTranscript, parseSrt, export*, store`,
  },
  {
    id: "course-builder",
    nameHe: "פיתוח קורסים (Course Builder)",
    purpose:
      "פלטפורמה ליצירת מסמכי הטמעה עבור מפתחי קורסים, מרצים ועוזרי הוראה, עם תצוגת הטמעה על מנת ליעל את תהליך ההטמעה ויישום לצוות מערכות למידה בפלטפורמות Moodle/edX.",
    workflow: [
      "יוצרים קורס ובונים מבנה: שיעורים ← עמודים.",
      "ממלאים כל עמוד ברכיבים ממאגר הרכיבים (טקסט, וידאו, שאלה, פורום ועוד) ומסמנים סטטוס.",
      "מעבירים לסטטוס מוכן להטמעה כאשר שיעור/עמוד מוכנים להטמעה; צוות המטמיעים רואה את השיעורים בתצוגת הטמעה ויכול לסמן מה כבר הוטמע בפלטפורמות השונות.",
      "אפשר לייבא ולייצא MBZ של Moodle ולשמור גיבוי מקומי.",
    ],
    liveUrl: "https://ai-tools-course-builder.vercel.app",
    hosting: "פרויקט Vercel נפרד, נפתח מהרכזת עם העברת התחברות.",
    vercelProjectUrl: "https://vercel.com/tauonlinecourses-projects/ai-tools-course-builder",
    repoPath: "apps/course-builder",
    databases: [
      {
        name: "פרויקט הפלטפורמה (Course Builder)",
        note: "קורסים, עמודים, בלוקים, הערות וקבצי MBZ — באותו פרויקט של ההתחברות.",
        dashboardUrl: PLATFORM_SUPABASE,
      },
    ],
    structure: `apps/course-builder/
├── agents/          ← מפרט ורשימת משימות (course-builder-mvp-spec.md)
├── api/chat.ts
├── supabase/        ← schema.sql + migrations
└── src/
    ├── pages/CoursesPage.tsx
    ├── components/  ← CourseShell, PageContent, blocks/
    └── lib/         ← api.ts, supabase.ts, mbzImport/mbzExport, courseBackup`,
  },
  {
    id: "mbz-explorer",
    nameHe: "ניתוח MBZ (MBZ Explorer)",
    purpose:
      "צפייה בגיבוי קורס של Moodle (.mbz) בדפדפן — מבנה, פעילויות ותוכן מפוענח.",
    workflow: [
      "מעלים קובץ .mbz — הוא נפתח בדפדפן בלבד, בלי שרת.",
      "מוצג עץ המבנה של הקורס (פרקים ופעילויות).",
      "בוחרים פעילות כדי לראות את התוכן המפוענח שלה.",
    ],
    liveUrl: `${HUB_URL}/mbz-explorer`,
    hosting: "מתארח בתוך הרכזת (אין פרויקט Vercel נפרד).",
    vercelProjectUrl: HUB_VERCEL_PROJECT,
    repoPath: "apps/mbz-explorer",
    databases: [],
    structure: `apps/mbz-explorer/
├── agents/          ← mbz explorer spec.md, mbz-file.md
└── src/
    ├── lib/mbz-parser/  ← חילוץ ופענוח (בלי UI)
    ├── lib/idb.ts       ← שמירה ב-IndexedDB
    ├── components/explorer/
    └── pages/`,
  },
  {
    id: "tau-support",
    nameHe: "תמיכה טכנית (TAU Support)",
    purpose:
      "מרכז את הודעות פורומי התמיכה הטכנית מכל הקורסים של אוניברסיטת תל אביב בפלטפורמת קמפוס IL ומציע טיוטות תשובה מבוססות מסמכי ידע ותשובות קודמות באמצעות AI.",
    workflow: [
      "הכלי מחובר לחשבון campus IL (Open edX) מאחורי הקלעים.",
      "הכלי מושך שרשורים ותגובות חדשים מכל הקורסים ב-courses.json.",
      "לכל שאלה מוצגות שאלות דומות וטיוטת תשובה מבוססת מסמכי מידע.",
      "דשבורד שאלות מציג קטגוריות ומגמות; מסמכי המידע נערכים מתוך הכלי.",
    ],
    liveUrl: "https://ai-tools-tau-support.vercel.app",
    hosting: "פרויקט Vercel נפרד, נפתח מהרכזת עם העברת התחברות.",
    vercelProjectUrl: "https://vercel.com/tauonlinecourses-projects/ai-tools-tau-support",
    repoPath: "apps/tau-support",
    databases: [
      {
        name: "פרויקט TAU Support",
        note: "מסמכי מידע, שאלות, embeddings ונתוני הלוח.",
        dashboardUrl: "https://supabase.com/dashboard/project/gfatxeznxjplrljcohog",
      },
      PLATFORM_DB,
    ],
    structure: `apps/tau-support/
├── agents/          ← הסבר על משיכת הפורומים
├── api/             ← forum-threads, tau-data, embed, lms-login, chat
├── server/          ← forumThreadsCore, tauDataHandler, questionDashboard
├── supabase/        ← schema.sql + migrations
└── src/
    ├── components/  ← לוח, כרטיסי שרשור, עורך מסמכי מידע
    └── lib/courses.json  ← רשימת הקורסים והפורומים`,
  },
  {
    id: "virtual-support",
    nameHe: "מדריכים - Virtual TAU",
    purpose:
      "מאגר ידע לצוות התמיכה עם שאלות ותשובות מבוססות מקורות וציטוטים.",
    workflow: [
      "מסדרים מסמכי ידע לפי תיקיות ועמודים בעמודת המקורות.",
      "שמירת מסמך מפרקת אותו לקטעים ויוצרת לו embeddings.",
      "שואלים שאלה בצ׳אט — התשובה נבנית רק מהמסמכים, עם ציטוטים.",
      "לחיצה על ציטוט פותחת את המסמך בחלון הצד.",
    ],
    liveUrl: "https://ai-tools-virtual-support.vercel.app",
    hosting: "פרויקט Vercel נפרד, נפתח מהרכזת עם העברת התחברות.",
    vercelProjectUrl: "https://vercel.com/tauonlinecourses-projects/ai-tools-virtual-support",
    repoPath: "apps/virtual-support",
    databases: [
      {
        name: "פרויקט Virtual Support",
        note: "תיקיות, מסמכים, קטעים ו-embeddings, ויומן שאלות.",
        dashboardUrl: "https://supabase.com/dashboard/project/qzjaymstjgwguagqtdit",
      },
      PLATFORM_DB,
    ],
    structure: `apps/virtual-support/
├── agents/README.md  ← ארכיטקטורה ומודל נתונים
├── api/              ← ask, data, admin-metrics, chat
├── server/           ← askHandler, askRetrieval, chunkAndEmbed, dataHandler
├── supabase/         ← schema.sql + migrations
└── src/components/   ← AskPage, DocumentsSidebar, DocView, DocEditor`,
  },
  {
    id: "dictionary-tool",
    nameHe: "מילון מונחים (Dictionary Tool)",
    purpose:
      "ממיר קובץ Excel של מונחים והגדרות לקובץ XML לייבוא מילון ב-Moodle.",
    workflow: [
      "מעלים Excel עם העמודות מושג והגדרה.",
      "בודקים את התצוגה המקדימה של המונחים.",
      "מורידים XML ומייבאים אותו לפעילות מילון ב-Moodle.",
    ],
    liveUrl: `${HUB_URL}/dictionary-tool`,
    hosting: "מתארח בתוך הרכזת (אין פרויקט Vercel נפרד). הכול רץ בדפדפן.",
    vercelProjectUrl: HUB_VERCEL_PROJECT,
    repoPath: "apps/dictionary-tool",
    databases: [],
    structure: `apps/dictionary-tool/
├── agents/              ← dictionary-tool-spec.md + קבצי דוגמה
└── src/
    ├── lib/parseExcel.ts        ← קריאת Excel וזיהוי עמודות
    ├── lib/buildGlossaryXml.ts  ← בניית XML והורדה
    └── pages/HomePage.tsx       ← העלאה ← תצוגה ← הורדה`,
  },
  {
    id: "video-transcriber",
    nameHe: "מתמלל וידאו (Video Transcriber)",
    purpose:
      "דף הורדה והוראות התקנה לתוכנת מתמלל הוידאו השולחנית, שנשמרת ב-SharePoint.",
    workflow: [
      "המשתמש לוחץ על הכפתור ונפתחת תיקיית SharePoint.",
      "מוריד את קובץ ה-zip, מחלץ ומריץ את קובץ ההתקנה.",
      "נוצר קיצור דרך לתוכנה בשולחן העבודה.",
    ],
    liveUrl: `${HUB_URL}/video-transcriber`,
    hosting:
      "דף בתוך הרכזת בלבד. התוכנה עצמה לא נמצאת בריפו — היא בתיקיית SharePoint.",
    vercelProjectUrl: HUB_VERCEL_PROJECT,
    repoPath: "apps/hub/src/pages/VideoTranscriberPage.tsx",
    databases: [],
    structure: `apps/hub/src/
├── pages/VideoTranscriberPage.tsx       ← קישור SharePoint והוראות התקנה
└── components/VideoTranscriberHost.tsx  ← בדיקת הרשאה`,
  },
];
