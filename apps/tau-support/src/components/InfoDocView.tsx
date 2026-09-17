import { Button, Spinner } from "@workspace/ui";
import { ForumBody } from "./ForumBody";
import type { InfoDoc } from "../lib/infoDocs";

interface InfoDocViewProps {
  doc: InfoDoc | null;
  loading?: boolean;
  deleting?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export function InfoDocView({
  doc,
  loading,
  deleting,
  onEdit,
  onDelete,
}: InfoDocViewProps) {
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
        בחרו נושא מהרשימה, או לחצו על <span className="mx-1 font-semibold">הוספת נושא</span>{" "}
        כדי ליצור נושא חדש.
      </div>
    );
  }

  return (
    <div dir="rtl" className="flex flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-200 pb-3">
        <h2 className="min-w-0 flex-1 text-xl font-semibold leading-snug text-surface-900 sm:text-2xl">
          {doc.title}
        </h2>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onEdit} disabled={deleting}>
            עריכה
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onDelete}
            disabled={deleting}
            title="מחיקת נושא"
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

      <section aria-label="דוגמאות לשאלות" className="rounded-control border border-surface-200 bg-surface-50 px-3 py-3">
        <p className="text-xs font-semibold text-surface-700">דוגמאות לשאלות</p>
        {doc.commonQuestions.length > 0 ? (
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-surface-800">
            {doc.commonQuestions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-sm text-amber-900">
            הוסיפו שאלות לדוגמה
            <button
              type="button"
              onClick={onEdit}
              className="ms-1 font-semibold underline-offset-2 hover:underline"
            >
              (עריכה)
            </button>
          </p>
        )}
      </section>

      {doc.body.trim() ? (
        <ForumBody raw_body={doc.body} />
      ) : (
        <p className="text-sm text-surface-500">אין תוכן לנושא זה.</p>
      )}
    </div>
  );
}
