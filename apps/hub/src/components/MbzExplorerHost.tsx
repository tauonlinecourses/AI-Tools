import { Navigate } from "react-router-dom";
import { Spinner } from "@workspace/ui";
import { usePlatformAuth } from "@workspace/auth/react";
import MbzExplorerApp from "../../../mbz-explorer/src/App";
import "../../../mbz-explorer/src/mbz.css";
import { LoginPage } from "./LoginPage";
import type { Locale } from "../i18n";

/** Same-origin MBZ UI, gated by hub Platform session + group tool access. */
export function MbzExplorerHost({ locale }: { locale: Locale }) {
  const { loading, session, allowedToolIds } = usePlatformAuth();
  const homeHref = locale === "en" ? "/en" : "/";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Spinner />
      </div>
    );
  }

  // Direct link / deep link: unsigned → login; signed-in without entitlement → hub.
  if (!session) {
    return <LoginPage locale={locale} />;
  }

  if (!allowedToolIds.includes("mbz-explorer")) {
    return <Navigate to={homeHref} replace />;
  }

  return <MbzExplorerApp />;
}
