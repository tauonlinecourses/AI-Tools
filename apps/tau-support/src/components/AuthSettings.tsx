import { useEffect, useState } from "react";
import { Input, Button, Spinner } from "@workspace/ui";
import {
  countPendingEmbeddings,
  embedAllPendingQaPairs,
} from "../lib/kbEmbed";
import { isSupabaseConfigured } from "../lib/supabase";

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
  /** Run check-all that seeds the latest 20 threads per course. */
  onSeedAllTop20?: () => void;
  seedAllBusy?: boolean;
  seedAllDisabled?: boolean;
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
  onSeedAllTop20,
  seedAllBusy = false,
  seedAllDisabled = false,
}: AuthSettingsProps) {
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [embedBusy, setEmbedBusy] = useState(false);
  const [embedMessage, setEmbedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !isSupabaseConfigured) {
      setPendingCount(null);
      return;
    }
    let cancelled = false;
    void countPendingEmbeddings().then((res) => {
      if (cancelled) return;
      if (res.ok && typeof res.count === "number") {
        setPendingCount(res.count);
      } else {
        setPendingCount(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleEmbedBackfill() {
    setEmbedBusy(true);
    setEmbedMessage(null);
    try {
      const res = await embedAllPendingQaPairs();
      if (res.skipped) {
        setEmbedMessage("Supabase is not configured.");
        return;
      }
      if (!res.ok) {
        setEmbedMessage(res.message ?? "Embedding failed");
        return;
      }
      setPendingCount(0);
      setEmbedMessage(
        `Embedded ${res.embedded ?? 0} pair(s)` +
          ((res.deleted ?? 0) > 0 ? `, removed ${res.deleted} stale` : "") +
          "."
      );
    } finally {
      setEmbedBusy(false);
    }
  }

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

          {onSeedAllTop20 ? (
            <div
              className="rounded-md border border-surface-200 bg-surface-50 p-3"
              dir="rtl"
            >
              <p className="text-sm font-semibold text-surface-900">
                טען 20 אחרונים לכל הקורסים
              </p>
              <p className="mt-1 text-xs text-surface-600">
                רץ על כל הקורסים (בלי הסנדבוקס) ומושך עד 20 שרשורים נוספים
                בכל קורס — רק כאלה שעדיין לא שמורים במערכת (ישנים יותר מהקיימים).
                אותה תור / עצור / המשך כמו{" "}
                <span className="whitespace-nowrap">בדיקת שאלות חדשות</span>.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={seedAllBusy || seedAllDisabled}
                  onClick={() => onSeedAllTop20()}
                >
                  {seedAllBusy ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner size="sm" />
                      בודק…
                    </span>
                  ) : (
                    "טען 20 לכל הקורסים"
                  )}
                </Button>
              </div>
            </div>
          ) : null}

          {isSupabaseConfigured ? (
            <div
              className="rounded-md border border-surface-200 bg-surface-50 p-3"
              dir="rtl"
            >
              <p className="text-sm font-semibold text-surface-900">
                הטמעות (RAG)
              </p>
              <p className="mt-1 text-xs text-surface-600">
                מסנכרן את כל זוגות השאלה–תשובה לטבלת הווקטורים. דורש{" "}
                <span dir="ltr">OPENAI_API_KEY</span> בשרת.
                {pendingCount !== null
                  ? ` ממתינים להטמעה: ${pendingCount}.`
                  : ""}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={embedBusy}
                  onClick={() => void handleEmbedBackfill()}
                >
                  {embedBusy ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner size="sm" />
                      מסנכרן…
                    </span>
                  ) : (
                    "סנכרן הטמעות"
                  )}
                </Button>
                {embedMessage ? (
                  <p className="text-xs text-surface-700">{embedMessage}</p>
                ) : null}
              </div>
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
