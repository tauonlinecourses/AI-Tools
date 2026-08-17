import { useEffect, useRef } from "react";
import { CommentIcon, XIcon } from "./icons";

/** Small corner badge when page notes are non-empty. */
function NotesBadge({ hasNotes }: { hasNotes: boolean }) {
  if (!hasNotes) return null;
  return (
    <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-[#0F6CBF] pointer-events-none" />
  );
}

interface PageNotesProps {
  notes: string;
  open: boolean;
  onToggle: () => void;
  onChange: (notes: string) => void;
  /** Children = the page header row. */
  children: React.ReactNode;
}

/**
 * Comment-style notes for the page: icon in the gutter to the right of the
 * title (same alignment as block comments); panel holds "הערות להטמעה".
 */
export function PageNotes({
  notes,
  open,
  onToggle,
  onChange,
  children,
}: PageNotesProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const hasNotes = !!notes.trim();
  const iconOpacity = hasNotes
    ? "opacity-100"
    : "opacity-25 hover:opacity-60";
  const iconTitle = hasNotes ? "הערות להטמעה" : "הוסף הערות להטמעה";

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!panelRef.current?.contains(event.target as Node)) onToggle();
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [open, onToggle]);

  return (
    <div className={`relative mb-4 ${open ? "z-40" : "z-0"}`}>
      <div className="min-w-0 w-full">{children}</div>

      {!open && (
        <button
          type="button"
          className={`absolute top-2 left-full ml-1.5 z-20 p-1 text-surface-600 transition-opacity duration-fast ${iconOpacity}`}
          title={iconTitle}
          aria-label={iconTitle}
          aria-expanded={false}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          <CommentIcon className="w-4 h-4" />
          <NotesBadge hasNotes={hasNotes} />
        </button>
      )}

      {open && (
        <div
          ref={panelRef}
          className="absolute top-0 left-full ml-1.5 z-30 w-64 bg-white border border-surface-200 shadow-md rounded-lg flex flex-col max-h-[min(28rem,70vh)] pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="הערות להטמעה"
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-200 shrink-0">
            <span className="relative shrink-0 text-surface-700 p-0.5" aria-hidden>
              <CommentIcon className="w-4 h-4" />
              <NotesBadge hasNotes={hasNotes} />
            </span>
            <span className="text-sm font-semibold text-surface-800 flex-1">
              הערות להטמעה
            </span>
            <button
              type="button"
              className="p-1 text-surface-400 hover:text-surface-900 transition-colors duration-fast"
              title="סגור"
              aria-label="סגור"
              onClick={onToggle}
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="px-3 py-2 shrink-0">
            <textarea
              rows={4}
              value={notes}
              placeholder="הערות חופשיות על העמוד (יוצגו גם בתצוגת ההטמעה)"
              onChange={(e) => onChange(e.target.value)}
              className="w-full px-2 py-1.5 text-sm leading-5 bg-surface-50 border border-surface-200 text-surface-900 placeholder:text-surface-400 outline-none resize-y min-h-[6rem]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
