import { Spinner } from "@workspace/ui";
import type { Document, Folder, IndexStatus } from "../lib/types";
import { DocBody } from "./DocBody";

const lastEditFormat = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatLastEdit(iso: string): string | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : lastEditFormat.format(date);
}

interface DocViewProps {
  doc: Document | null;
  folder?: Folder | null;
  loading?: boolean;
  /** Show a short "saved" note (right after a save). */
  justSaved?: boolean;
  /** Background search indexing of this page; undefined = up to date. */
  indexStatus?: IndexStatus;
  onRetryIndex?: () => void;
  onClose?: () => void;
  onEdit: () => void;
}

function SaveStatus({
  justSaved,
  indexStatus,
  onRetryIndex,
}: Pick<DocViewProps, "justSaved" | "indexStatus" | "onRetryIndex">) {
  if (indexStatus === "failed") {
    return (
      <p className="mt-1 text-xs text-danger" role="status">
        נשמר, אבל העדכון לחיפוש נכשל.{" "}
        {onRetryIndex ? (
          <button
            type="button"
            onClick={onRetryIndex}
            className="font-medium underline hover:no-underline"
          >
            נסו שוב
          </button>
        ) : null}
      </p>
    );
  }
  if (!justSaved && indexStatus !== "indexing") return null;
  return (
    <p
      className="mt-1 inline-flex items-center gap-1.5 text-xs text-surface-500"
      role="status"
    >
      {justSaved ? <span className="text-emerald-700">✓ נשמר</span> : null}
      {justSaved && indexStatus === "indexing" ? <span aria-hidden>·</span> : null}
      {indexStatus === "indexing" ? (
        <span className="inline-flex items-center gap-1">
          <Spinner size="sm" />
          מעדכן את המערכת…
        </span>
      ) : null}
    </p>
  );
}

export function DocView({
  doc,
  folder,
  loading,
  justSaved,
  indexStatus,
  onRetryIndex,
  onClose,
  onEdit,
}: DocViewProps) {
  if (loading && !doc) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center gap-2 text-sm text-surface-600">
        <Spinner size="sm" />
        טוען…
      </div>
    );
  }

  if (!doc) {
    return (
      <div
        dir="rtl"
        className="flex h-full min-h-[280px] items-center justify-center p-6 text-center text-sm text-surface-600"
      >
        בחרו מסמך מהרשימה, או לחצו על{" "}
        <span className="mx-1 font-semibold">+ מסמך</span>
        כדי ליצור מסמך חדש.
      </div>
    );
  }

  const lastEdit = formatLastEdit(doc.updatedAt);

  return (
    <div dir="rtl" className="flex flex-col">
      {/* Sticks to the top of the column's scroll container (App.tsx). */}
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-surface-200 bg-white px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
        <div className="min-w-0 flex-1">
          {folder ? (
            <p className="mb-1 text-xs font-medium text-surface-500">
              {folder.name}
            </p>
          ) : null}
          <h2 className="text-lg font-semibold leading-snug text-surface-900 sm:text-xl">
            {doc.title}
          </h2>
          {lastEdit ? (
            <p className="mt-1 text-xs text-surface-500">
              עודכן לאחרונה:{" "}
              <time dateTime={doc.updatedAt}>{lastEdit}</time>
            </p>
          ) : null}
          <SaveStatus
            justSaved={justSaved}
            indexStatus={indexStatus}
            onRetryIndex={onRetryIndex}
          />
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-surface-500 hover:bg-surface-100 hover:text-surface-900"
          title="עריכה"
          aria-label="עריכת מסמך"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
        {/* Last in RTL flex = visual left edge of the column */}
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-surface-500 hover:bg-surface-100 hover:text-surface-900"
            title="סגירה"
            aria-label="סגירת מסמך"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="h-6 w-6"
              aria-hidden
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        ) : null}
      </header>

      <div className="px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
        {doc.body.trim() ? (
          <DocBody body={doc.body} />
        ) : (
          <p className="text-sm text-surface-500">אין תוכן במסמך זה.</p>
        )}
      </div>
    </div>
  );
}
