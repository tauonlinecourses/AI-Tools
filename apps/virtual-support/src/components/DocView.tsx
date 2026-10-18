import { Button, Spinner } from "@workspace/ui";
import type { Document, Folder } from "../lib/types";
import { DocBody } from "./DocBody";

interface DocViewProps {
  doc: Document | null;
  folder?: Folder | null;
  loading?: boolean;
  deleting?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export function DocView({
  doc,
  folder,
  loading,
  deleting,
  onEdit,
  onDelete,
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
    <div dir="rtl" className="flex flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-200 pb-3">
        <div className="min-w-0 flex-1">
          {folder ? (
            <p className="mb-1 text-xs font-medium text-surface-500">
              {folder.name}
            </p>
          ) : null}
          <h2 className="text-xl font-semibold leading-snug text-surface-900 sm:text-2xl">
            {doc.title}
          </h2>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onEdit}
            disabled={deleting}
          >
            עריכה
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onDelete}
            disabled={deleting}
            title="מחיקת מסמך"
            className="!text-rose-800 hover:!bg-rose-50"
          >
            {deleting ? (
              <span className="inline-flex items-center gap-2">
                <Spinner size="sm" />
                מוחק…
              </span>
            ) : (
              "מחיקה"
            )}
          </Button>
        </div>
      </header>

      {doc.body.trim() ? (
        <DocBody body={doc.body} />
      ) : (
        <p className="text-sm text-surface-500">אין תוכן במסמך זה.</p>
      )}
    </div>
  );
}
