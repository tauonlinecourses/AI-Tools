import React, { useCallback, useEffect, useRef } from "react";

/** Small labeled field primitives shared by the block editors. */

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-surface-700">{label}</span>
      {children}
    </label>
  );
}

const inputClasses =
  "w-full h-10 px-3 text-base bg-white border border-surface-200 text-surface-900 " +
  "placeholder:text-surface-400 outline-none transition-colors duration-fast";

export function TextField(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputClasses} />;
}

export function TextAreaField(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={
        "w-full px-3 py-2 text-base bg-white border border-surface-200 text-surface-900 " +
        "placeholder:text-surface-400 outline-none transition-colors duration-fast resize-y"
      }
    />
  );
}

const autoGrowClasses =
  "w-full min-h-10 px-3 py-2 text-base leading-6 bg-white border border-surface-200 " +
  "text-surface-900 placeholder:text-surface-400 outline-none transition-colors " +
  "duration-fast resize-none overflow-hidden read-only:bg-transparent";

/** Single-line-looking textarea that grows taller as the value wraps. */
export function AutoGrowTextField({
  value,
  onChange,
  className,
  ...props
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "rows">) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const syncHeight = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 40)}px`;
  }, []);

  useEffect(() => {
    syncHeight();
  }, [value, syncHeight]);

  return (
    <textarea
      {...props}
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => {
        onChange?.(e);
        // Grow immediately so typing long lines does not wait for the next paint.
        requestAnimationFrame(syncHeight);
      }}
      className={`${autoGrowClasses}${className ? ` ${className}` : ""}`}
    />
  );
}

export function SelectField(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={inputClasses} />;
}

/** Implement-mode notes display — only when non-empty; hidden in preview. */
export function NotesDisplay({ notes }: { notes?: string }) {
  if (!notes?.trim()) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-surface-700">הערות</span>
      <p className="text-base text-danger whitespace-pre-wrap">{notes}</p>
    </div>
  );
}
