import type { InfoDoc } from "../lib/infoDocs";

interface InfoDocsSidebarProps {
  docs: InfoDoc[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  loading?: boolean;
}

export function InfoDocsSidebar({
  docs,
  selectedId,
  onSelect,
  onAdd,
  loading,
}: InfoDocsSidebarProps) {
  return (
    <aside
      dir="rtl"
      className="relative z-10 flex w-full shrink-0 flex-col border-surface-200 bg-white md:w-[34%] md:border-e md:shadow-[-3px_0_4px_-2px_rgba(0,0,0,0.12)]"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-surface-200 px-3 py-2.5">
        <p className="text-sm font-semibold text-surface-900">נושאי מידע</p>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-8 items-center gap-1 rounded-control border border-surface-200 bg-white px-2.5 text-xs font-semibold text-surface-800 shadow-sm transition-colors hover:bg-sky-50 hover:text-sky-950"
          title="הוספת נושא"
        >
          <span aria-hidden className="text-base leading-none">
            +
          </span>
          הוספת נושא
        </button>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {loading && docs.length === 0 ? (
          <li className="px-3 py-4 text-right text-sm text-surface-500">
            טוען נושאים…
          </li>
        ) : null}

        {!loading && docs.length === 0 ? (
          <li className="px-3 py-4 text-right text-sm text-surface-500">
            אין נושאים עדיין. לחצו על <span className="font-semibold">הוספת נושא</span>.
          </li>
        ) : null}

        {docs.map((doc) => {
          const selected = selectedId === doc.id;
          return (
            <li
              key={doc.id}
              className="border-b border-surface-200 last:border-b-0"
            >
              <button
                type="button"
                onClick={() => onSelect(doc.id)}
                className={`flex h-full w-full flex-col gap-0.5 px-3 py-3 text-right transition-colors ${
                  selected
                    ? "bg-sky-100 hover:bg-sky-100"
                    : "bg-transparent hover:bg-sky-50"
                }`}
              >
                <span
                  className={`text-sm font-semibold leading-snug ${
                    selected ? "text-sky-950" : "text-surface-900"
                  }`}
                >
                  {doc.title || "ללא כותרת"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
