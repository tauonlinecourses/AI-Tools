import { Spinner } from "@workspace/ui";
import type { Document, Folder } from "../lib/types";
import { DocBody } from "./DocBody";

interface DocViewProps {
  doc: Document | null;
  folder?: Folder | null;
  loading?: boolean;
  onClose?: () => void;
  onEdit: () => void;
}

export function DocView({
  doc,
  folder,
  loading,
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

  return (
    <div dir="rtl" className="flex flex-col gap-4 p-4 sm:p-5">
      <header className="flex items-center gap-2 border-b border-surface-200 pb-3">
        <div className="min-w-0 flex-1">
          {folder ? (
            <p className="mb-1 text-xs font-medium text-surface-500">
              {folder.name}
            </p>
          ) : null}
          <h2 className="text-lg font-semibold leading-snug text-surface-900 sm:text-xl">
            {doc.title}
          </h2>
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

      {doc.body.trim() ? (
        <DocBody body={doc.body} />
      ) : (
        <p className="text-sm text-surface-500">אין תוכן במסמך זה.</p>
      )}
    </div>
  );
}
