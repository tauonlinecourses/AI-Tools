import type { BlockProps, CourseViewMode, NotesBoardColumn } from "../../lib/types";
import { PlusIcon } from "../icons";

const COLUMN_COLORS = ["#C8A2D4", "#F28B82", "#F6BF73"];

interface Props {
  props: BlockProps;
  mode: CourseViewMode;
  onChange: (props: BlockProps) => void;
}

export function NotesBoardBlock({ props, mode, onChange }: Props) {
  const editable = mode === "edit";
  const columns: NotesBoardColumn[] = props.columns ?? [
    { id: crypto.randomUUID(), title: "", items: [] },
    { id: crypto.randomUUID(), title: "", items: [] },
    { id: crypto.randomUUID(), title: "", items: [] },
  ];

  function updateColumns(next: NotesBoardColumn[]) {
    onChange({ ...props, columns: next });
  }

  function handleColumnTitle(colIdx: number, title: string) {
    const next = columns.map((c, i) => (i === colIdx ? { ...c, title } : c));
    updateColumns(next);
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {columns.map((col, colIdx) => (
        <div
          key={col.id}
          className="border border-surface-200 rounded overflow-hidden"
        >
          <div
            className="h-2"
            style={{ backgroundColor: COLUMN_COLORS[colIdx % COLUMN_COLORS.length] }}
          />
          <div className="p-2 flex flex-col gap-2">
            {editable ? (
              <input
                className="text-sm font-semibold text-surface-700 bg-transparent outline-none border-b border-transparent focus:border-surface-300 w-full"
                placeholder="כותרת"
                value={col.title}
                onChange={(e) => handleColumnTitle(colIdx, e.target.value)}
              />
            ) : (
              <span className="text-sm font-semibold text-surface-700">
                {col.title || "כותרת"}
              </span>
            )}

            <button
              type="button"
              className="flex items-center justify-center gap-1 text-xs text-surface-400 border border-dashed border-surface-300 rounded py-1 cursor-default"
              disabled
            >
              <PlusIcon className="w-3 h-3" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
