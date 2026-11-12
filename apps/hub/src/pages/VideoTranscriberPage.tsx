import { PageLayout } from "@workspace/ui";
import { SoftPageBg } from "../components/SoftPageBg";

const SHAREPOINT_FOLDER_URL =
  "https://tauex.sharepoint.com/sites/AI_194694/Shared%20Documents/Forms/AllItems.aspx?id=%2Fsites%2FAI%5F194694%2FShared%20Documents%2FAI%20Tools%2F%D7%9B%D7%9C%D7%99%20%D7%9C%D7%AA%D7%9E%D7%9C%D7%95%D7%9C%20%D7%95%D7%99%D7%93%D7%90%D7%95&p=true&ga=1";

const INSTALL_STEPS = [
  'ללחוץ על כפתור "הורדה מ-SharePoint" כדי לפתוח את תיקיית SharePoint.',
  'ללחוץ כפתור ימני על קובץ ה-zip ולבחור "הורדה".',
  "לחלץ אותו לתיקייה שבה תרצו שהתוכנה תהיה שמורה.",
  'להיכנס לתיקייה המחולצת וללחוץ על "התקנת המתמלל".',
  "ייפתח מסך שחור שיטען ויוריד דברים, ובסוף תיפתח התוכנה.",
  'יווצר אוטומטית קיצור דרך על שולחן העבודה ובתפריט ההתחלה עם התוכנה "מתמלל וידאו" בשביל הפעמים הבאות שבהן תרצו להשתמש בה.',
] as const;

/** Hub-hosted guide: SharePoint download + install steps (no zip in this repo). */
export function VideoTranscriberPage() {
  return (
    <div className="relative min-h-screen">
      <SoftPageBg />
      <PageLayout
        locale="he"
        hubUrl="/"
        toolName="Video Transcriber"
        toolDescription="Download and install the desktop Video Transcriber from SharePoint"
        toolNameHe="מתמלל וידאו"
        toolDescriptionHe="הורדה והתקנה של תוכנת מתמלל הוידאו משולחן העבודה דרך SharePoint"
        maxWidth="md"
        className="relative z-10 !bg-transparent"
      >
        <div dir="rtl" className="space-y-8 py-2">
          <header className="space-y-2">
            <h1 className="text-2xl font-semibold text-gray-900">
              מתמלל וידאו
            </h1>
            <p className="text-sm leading-relaxed text-gray-600">
              הורדה והתקנה של תוכנת מתמלל הוידאו משולחן העבודה דרך SharePoint
            </p>
          </header>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-gray-900">
              הוראות התקנה:
            </h2>
            <ol className="list-decimal list-inside space-y-2 text-sm leading-relaxed text-gray-700">
              {INSTALL_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>

          <div className="flex justify-center">
            <a
              href={SHAREPOINT_FOLDER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={[
                "inline-flex items-center justify-center font-semibold rounded-control",
                "transition-colors duration-fast",
                "h-11 px-6 text-sm",
                "bg-black text-white hover:bg-gray-900 active:bg-black border border-black",
              ].join(" ")}
            >
              הורדה מ-SharePoint
            </a>
          </div>
        </div>
      </PageLayout>
    </div>
  );
}
