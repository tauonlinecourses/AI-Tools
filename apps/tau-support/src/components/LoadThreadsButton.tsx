import { useEffect, useId, useRef, useState } from "react";

export const THREAD_COUNT_OPTIONS = [3, 5, 10] as const;
export type ThreadCountOption = (typeof THREAD_COUNT_OPTIONS)[number];

interface LoadThreadsButtonProps {
  threadCount: string;
  onThreadCountChange: (count: ThreadCountOption) => void;
  onLoad: () => void;
  loading?: boolean;
  disabled?: boolean;
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function parseThreadCount(value: string): ThreadCountOption {
  const n = Number.parseInt(value, 10);
  if (n === 5 || n === 10) return n;
  return 3;
}

export function LoadThreadsButton({
  threadCount,
  onThreadCountChange,
  onLoad,
  loading = false,
  disabled = false,
}: LoadThreadsButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const selected = parseThreadCount(threadCount);
  const isDisabled = disabled || loading;

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative inline-flex" ref={rootRef}>
      <div
        className={[
          "inline-flex h-8 overflow-hidden rounded-control border text-xs font-semibold",
          isDisabled
            ? "cursor-not-allowed border-surface-200 bg-surface-100 text-surface-500"
            : "border-gray-900 bg-white text-gray-900",
        ].join(" ")}
      >
        {/* In RTL: first child sits on the right — label, then arrow on the visual left. */}
        <button
          type="button"
          onClick={onLoad}
          disabled={isDisabled}
          className={[
            "inline-flex items-center justify-center gap-1.5 px-3 transition-colors",
            isDisabled
              ? "cursor-not-allowed"
              : "hover:bg-gray-50 active:bg-gray-100",
          ].join(" ")}
        >
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : null}
          {`טען ${selected} תגובות אחרונות`}
        </button>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          disabled={isDisabled}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label="בחירת מספר שרשורים לטעינה"
          title={`מספר שרשורים: ${selected}`}
          className={[
            "inline-flex w-7 items-center justify-center border-s transition-colors",
            isDisabled
              ? "cursor-not-allowed border-surface-200"
              : "border-gray-900 hover:bg-gray-50 active:bg-gray-100",
          ].join(" ")}
        >
          <ChevronDownIcon />
        </button>
      </div>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="מספר שרשורים לטעינה"
          className="absolute left-0 top-full z-40 mt-1 min-w-[9rem] overflow-hidden rounded-control border border-surface-200 bg-white py-1 text-right shadow-lg"
        >
          <p className="px-3 py-1.5 text-[10px] font-medium text-surface-500">
            כמה שרשורים לטעון
          </p>
          {THREAD_COUNT_OPTIONS.map((count) => {
            const isSelected = count === selected;
            return (
              <button
                key={count}
                type="button"
                role="menuitemradio"
                aria-checked={isSelected}
                className={[
                  "flex w-full items-center justify-between px-3 py-1.5 text-xs transition-colors",
                  isSelected
                    ? "bg-surface-50 font-semibold text-surface-900"
                    : "text-surface-700 hover:bg-surface-50",
                ].join(" ")}
                onClick={() => {
                  onThreadCountChange(count);
                  setOpen(false);
                }}
              >
                <span>{count}</span>
                {isSelected ? (
                  <span className="text-surface-500" aria-hidden>
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
