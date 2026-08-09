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
