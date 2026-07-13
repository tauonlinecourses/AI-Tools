import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftElement?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  hint,
  leftElement,
  className = "",
  id,
  ...props
}) => {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-semibold text-surface-900">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {leftElement && (
          <span className="absolute left-3 text-surface-400">{leftElement}</span>
        )}
        <input
          id={inputId}
          className={[
            "w-full h-9 px-3 text-sm",
            "bg-white border border-surface-200",
            "text-surface-900 placeholder:text-surface-400",
            "outline-none focus:border-surface-900",
            "disabled:bg-surface-50 disabled:text-surface-400 disabled:cursor-not-allowed",
            "transition-colors duration-fast",
            error ? "border-danger" : "",
            leftElement ? "pl-9" : "",
            className,
          ].join(" ")}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {hint && !error && <p className="text-xs text-surface-500">{hint}</p>}
    </div>
  );
};
