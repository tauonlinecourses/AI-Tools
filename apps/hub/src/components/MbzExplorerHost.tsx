import { Spinner } from "@workspace/ui";
import { usePlatformAuth } from "@workspace/auth/react";
import MbzExplorerApp from "../../../mbz-explorer/src/App";
import "../../../mbz-explorer/src/mbz.css";
import { SoftPageBg } from "./SoftPageBg";
import { LoginPage } from "./LoginPage";
import { ui, type Locale } from "../i18n";

/** Same-origin MBZ UI, gated by hub Platform session + group tool access. */
export function MbzExplorerHost({ locale }: { locale: Locale }) {
  const { loading, session, allowedToolIds } = usePlatformAuth();
  const t = ui[locale];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Spinner />
      </div>
    );
  }

  if (!session) {
    return <LoginPage locale={locale} />;
  }

  if (!allowedToolIds.includes("mbz-explorer")) {
    return (
      <div className="relative min-h-screen">
        <SoftPageBg />
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center gap-3 px-6">
          <p className="text-sm text-surface-600">
            {locale === "he"
              ? "אין לך הרשאה לכלי זה"
              : "You do not have access to this tool"}
          </p>
          <a href={locale === "en" ? "/en" : "/"} className="text-sm font-semibold underline">
            {t.title}
          </a>
        </div>
      </div>
    );
  }

  return <MbzExplorerApp />;
}
