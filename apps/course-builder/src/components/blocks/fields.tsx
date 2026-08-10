import React from "react";

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

export function SelectField(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={inputClasses} />;
}

/** Edit-mode notes field shared by every block type. */
export function NotesField({
  value,
  onChange,
}: {
  value?: string;
  onChange: (notes: string) => void;
}) {
  return (
    <Field label="הערות">
      <TextAreaField
        rows={1}
        value={value ?? ""}
        placeholder="הערות להטמעה (יוצגו בתצוגת ההטמעה)"
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
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
