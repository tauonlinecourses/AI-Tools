import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Locale } from "../i18n";

export function UserMenu({
  locale,
  email,
  groupNames,
  onSignOut,
}: {
  locale: Locale;
  email?: string | null;
  groupNames: string[];
  onSignOut: () => void;
}) {
  const changePasswordHref =
    locale === "en" ? "/en/auth/change-password" : "/auth/change-password";
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const groupsInline =
    groupNames.length > 0
      ? groupNames.join(", ")
      : locale === "he"
        ? "אין צוותים"
        : "No teams";

  return (
    <div className="relative" ref={rootRef} dir="ltr">
      <button
        type="button"
        aria-label={locale === "he" ? "תפריט משתמש" : "User menu"}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 rounded-control px-2.5 py-1.5 text-start transition-colors duration-fast hover:bg-surface-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface-400"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-200 text-surface-500">
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="12" cy="8" r="3.5" />
            <path d="M4.5 19.5c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" />
          </svg>
        </span>

        {/* Width follows the email; multi-group names truncate to that same width. */}
        <span className="w-fit max-w-[14rem] min-w-0 sm:max-w-[18rem]">
          {email && (
            <span className="block whitespace-nowrap text-sm font-medium text-surface-800">
              {email}
            </span>
          )}
          <span
            className="block truncate text-xs text-surface-500"
            title={groupsInline}
          >
            {groupsInline}
          </span>
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute start-0 top-full z-30 mt-2 min-w-[12rem] max-w-[18rem] rounded-lg border border-surface-200 bg-white p-1 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.28)]"
        >
          {email && (
            <div className="truncate px-3 py-2 text-xs text-surface-500">
              {email}
            </div>
          )}
          <div className="border-t border-surface-100 px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-surface-400">
              {locale === "he" ? "צוותים" : "Teams"}
            </p>
            {groupNames.length > 0 ? (
              <ul className="mt-1 space-y-0.5">
                {groupNames.map((name) => (
                  <li key={name} className="break-words text-xs text-surface-700">
                    {name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-surface-400">
                {locale === "he" ? "אין צוותים" : "No teams"}
              </p>
            )}
          </div>
          <Link
            role="menuitem"
            to={changePasswordHref}
            onClick={() => setOpen(false)}
            className="block w-full rounded-control px-3 py-2 text-start text-xs font-semibold text-surface-700 transition-colors duration-fast hover:bg-surface-50"
          >
            {locale === "he" ? "שינוי סיסמה" : "Change password"}
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="w-full rounded-control px-3 py-2 text-start text-xs font-semibold text-red-600 transition-colors duration-fast hover:bg-red-50"
          >
            {locale === "he" ? "התנתקות" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
