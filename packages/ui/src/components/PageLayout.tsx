import React, { useEffect, useState } from "react";
import {
  hubHref,
  persistHubLocale,
  resolveHubLocale,
  type HubLocale,
} from "../hub";
import logoSrc from "../assets/Logo.png";

interface PageLayoutProps {
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
  toolName?: string;
  toolDescription?: string;
  /** Hebrew tool title shown when hub locale is `he`. Falls back to `toolName`. */
  toolNameHe?: string;
  /** Hebrew tool description shown when hub locale is `he`. Falls back to `toolDescription`. */
  toolDescriptionHe?: string;
  /**
   * Extra path segments after the tool name (e.g. All courses / Course title).
   * Items with `to` render as links; others are plain current-page labels.
   */
  toolTrail?: Array<{ label: string; to?: string }>;
  /**
   * Custom in-app link for `toolTrail` items that have `to`
   * (e.g. react-router `Link`). Defaults to a plain `<a href>`.
   */
  renderTrailLink?: (props: {
    to: string;
    className: string;
    children: React.ReactNode;
  }) => React.ReactNode;
  /**
   * Force header locale. When omitted, uses `?lang=` then localStorage
   * (`ai-tools-hub-locale`), defaulting to Hebrew.
   */
  locale?: HubLocale;
  /** Defaults to the hub home for the active locale (localhost in DEV, Vercel in production). */
  hubUrl?: string;
  /** When false, content fills the area under the nav with no outer padding (for full-bleed tools). */
  padded?: boolean;
}

const maxWidthStyles = {
  sm:   "max-w-screen-sm",
  md:   "max-w-screen-md",
  lg:   "max-w-screen-lg",
  xl:   "max-w-screen-xl",
  "2xl":"max-w-screen-2xl",
  full: "max-w-full",
};

const hubLabel: Record<HubLocale, string> = {
  en: "Hub",
  he: "בית",
};

export const PageLayout: React.FC<PageLayoutProps> = ({
  children,
  maxWidth = "xl",
  toolName,
  toolDescription,
  toolNameHe,
  toolDescriptionHe,
  toolTrail,
  renderTrailLink,
  locale: localeProp,
  hubUrl,
  padded = true,
}) => {
  const [locale, setLocale] = useState<HubLocale>(
    () => localeProp ?? resolveHubLocale(),
  );

  useEffect(() => {
    const next = localeProp ?? resolveHubLocale();
    setLocale(next);
    persistHubLocale(next);
  }, [localeProp]);

  const resolvedHubUrl = hubUrl ?? hubHref(locale);
  const displayName =
    locale === "he" ? (toolNameHe ?? toolName) : toolName;
  const displayDescription =
    locale === "he"
      ? (toolDescriptionHe ?? toolDescription)
      : toolDescription;
  const dir = locale === "he" ? "rtl" : "ltr";

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Top nav bar */}
      <header
        dir={dir}
        lang={locale === "he" ? "he" : "en"}
        className="h-12 bg-white border-b border-surface-200 flex items-center px-4 shrink-0"
      >
        <a
          href={resolvedHubUrl}
          className="text-xs text-surface-500 hover:text-surface-900 transition-colors duration-fast flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          {hubLabel[locale]}
        </a>
        {displayName && (
          <>
            <span className="mx-2 text-surface-300">/</span>
            <span
              className={`text-sm text-surface-900 ${
                toolTrail && toolTrail.length > 0 ? "" : "font-semibold"
              }`}
            >
              {displayName}
            </span>
          </>
        )}
        {toolTrail?.map((crumb, index) => {
          const crumbClass = crumb.to
            ? "text-sm font-semibold text-surface-900 hover:text-surface-700 transition-colors duration-fast truncate max-w-[12rem] sm:max-w-[16rem]"
            : "text-sm text-surface-900 truncate max-w-[12rem] sm:max-w-[20rem]";
          return (
            <React.Fragment key={`${crumb.label}-${index}`}>
              <span className="mx-2 text-surface-300">/</span>
              {crumb.to
                ? (renderTrailLink?.({
                    to: crumb.to,
                    className: crumbClass,
                    children: crumb.label,
                  }) ?? (
                    <a href={crumb.to} className={crumbClass}>
                      {crumb.label}
                    </a>
                  ))
                : (
                  <span className={crumbClass}>{crumb.label}</span>
                )}
            </React.Fragment>
          );
        })}
        {displayDescription && (
          <span className="ms-3 text-xs text-surface-500 hidden sm:block truncate">
            {displayDescription}
          </span>
        )}
        <a href={resolvedHubUrl} className="ms-auto shrink-0" aria-label={hubLabel[locale]}>
          <img
            src={logoSrc}
            alt=""
            aria-hidden
            className="h-8 w-auto"
          />
        </a>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-h-0">
        <div
          className={[
            "w-full mx-auto flex-1 flex flex-col min-h-0",
            padded ? "px-4 sm:px-6 py-6" : "",
            maxWidthStyles[maxWidth],
          ].join(" ")}
        >
          {children}
        </div>
      </main>
    </div>
  );
};
