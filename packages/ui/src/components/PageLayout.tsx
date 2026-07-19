import React from "react";
import { hubHref } from "../hub";
import logoSrc from "../assets/Logo.png";

interface PageLayoutProps {
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
  toolName?: string;
  toolDescription?: string;
  /** Defaults to localhost in DEV and the Vercel hub URL in production. */
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

export const PageLayout: React.FC<PageLayoutProps> = ({
  children,
  maxWidth = "xl",
  toolName,
  toolDescription,
  hubUrl = hubHref(),
  padded = true,
}) => {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Top nav bar */}
      <header className="h-12 bg-white border-b border-surface-200 flex items-center px-4 shrink-0">
        <a
          href={hubUrl}
          className="text-xs text-surface-500 hover:text-surface-900 transition-colors duration-fast flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          Hub
        </a>
        {toolName && (
          <>
            <span className="mx-2 text-surface-300">/</span>
            <span className="text-sm font-semibold text-surface-900">{toolName}</span>
          </>
        )}
        {toolDescription && (
          <span className="ml-3 text-xs text-surface-500 hidden sm:block">
            {toolDescription}
          </span>
        )}
        <img
          src={logoSrc}
          alt=""
          aria-hidden
          className="ml-auto h-8 w-auto shrink-0"
        />
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
