import type { BlockProps, CourseViewMode } from "../../lib/types";
import { PAGE_TYPE_LOGO } from "../../lib/types";

interface Props {
  props: BlockProps;
  mode: CourseViewMode;
  onChange: (props: BlockProps) => void;
}

export function ForumBlock(_props: Props) {
  return (
    <div className="rounded-lg border border-dashed border-surface-300 bg-white px-4 py-5 flex flex-col gap-3 opacity-70">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-surface-500">דיונים</span>
        <span className="text-xs text-surface-400">תצוגה לדוגמה</span>
      </div>
      {["נושא לדיון 1", "נושא לדיון 2"].map((label) => (
        <div
          key={label}
          className="flex items-center gap-3 rounded-md border border-surface-100 bg-surface-50 px-3 py-2.5"
        >
          <img
            src={PAGE_TYPE_LOGO.forum}
            alt=""
            className="w-4 h-4 object-contain shrink-0 opacity-60"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-surface-600 truncate">{label}</p>
            <p className="text-xs text-surface-400">0 תגובות</p>
          </div>
        </div>
      ))}
    </div>
  );
}
