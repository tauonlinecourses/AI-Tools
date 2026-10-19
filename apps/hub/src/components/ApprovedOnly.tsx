import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Spinner } from "@workspace/ui";
import { usePlatformAuth } from "@workspace/auth/react";
import type { Locale } from "../i18n";
import { AccountStatusPage } from "./AccountStatusPage";

export function ApprovedOnly({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const { loading, session, accountStatus } = usePlatformAuth();
  const homeHref = locale === "en" ? "/en" : "/";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Spinner />
      </div>
    );
  }
  if (!session) {
    return <Navigate to={homeHref} replace />;
  }
  if (accountStatus === "pending" || accountStatus === "rejected") {
    return <AccountStatusPage locale={locale} status={accountStatus} />;
  }
  return <>{children}</>;
}
