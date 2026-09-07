import { useEffect } from "react";
import { Input, Button } from "@workspace/ui";

export interface AuthSettingsValues {
  threadCount: string;
  useCookies: boolean;
  csrfToken: string;
  jwtHeaderPayload: string;
  jwtSignature: string;
}

interface AuthSettingsProps {
  values: AuthSettingsValues;
  onChange: (patch: Partial<AuthSettingsValues>) => void;
  open: boolean;
  onClose: () => void;
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function AuthSettings({
  values,
  onChange,
  open,
  onClose,
}: AuthSettingsProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onClick={onClose}
    >
      <div
        className="relative my-8 w-full max-w-lg rounded-lg border border-surface-200 bg-white shadow-xl"
        dir="ltr"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-surface-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-surface-900">Settings</h2>
            <p className="mt-0.5 text-xs text-surface-500">
              {values.useCookies ? "Browser cookies" : "Env login"}
              {` · ${values.threadCount || "3"} threads`}
              {" · forum per course in courses.json"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-control p-1 text-surface-500 transition-colors hover:bg-surface-100 hover:text-surface-900"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="בדוק הכל page size"
              placeholder="3"
              hint="Page size for בדוק הכל only (1–20). טען תגובות חדשות always loads every newer thread for the selected course."
              value={values.threadCount}
              onChange={(e) => onChange({ threadCount: e.target.value })}
            />
          </div>

          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={values.useCookies}
              onChange={(e) => onChange({ useCookies: e.target.checked })}
            />
            <span className="text-sm text-surface-800">
              <span className="font-semibold text-surface-900">
                Use browser cookies
              </span>
              <span className="mt-0.5 block text-xs text-surface-500">
                Paste csrftoken + both edx-jwt-cookie-* values from
                courses.campus.gov.il after a manual login.
              </span>
            </span>
          </label>

          {values.useCookies ? (
            <div className="grid gap-3 sm:grid-cols-1">
              <Input
                label="csrftoken"
                type="text"
                placeholder="Paste csrftoken cookie value"
                value={values.csrfToken}
                onChange={(e) => onChange({ csrfToken: e.target.value })}
                autoComplete="off"
              />
              <Input
                label="edx-jwt-cookie-header-payload"
                type="text"
                placeholder="Paste edx-jwt-cookie-header-payload value"
                value={values.jwtHeaderPayload}
                onChange={(e) => onChange({ jwtHeaderPayload: e.target.value })}
                autoComplete="off"
              />
              <Input
                label="edx-jwt-cookie-signature"
                type="text"
                placeholder="Paste edx-jwt-cookie-signature value"
                value={values.jwtSignature}
                onChange={(e) => onChange({ jwtSignature: e.target.value })}
                autoComplete="off"
              />
            </div>
          ) : null}
        </div>

        <div className="flex justify-end border-t border-surface-200 px-4 py-3">
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
