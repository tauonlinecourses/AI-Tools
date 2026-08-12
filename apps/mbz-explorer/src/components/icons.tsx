interface IconProps {
  className?: string;
}

const shrink = "shrink-0";

/** Chevron; rotate via className when collapsed. */
export function ChevronDownIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg
      className={`${shrink} ${className}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

export function FolderIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg
      className={`${shrink} ${className}`}
      fill="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
    </svg>
  );
}

export function FileIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg
      className={`${shrink} ${className}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 2v6h6" />
    </svg>
  );
}

export function HomeIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg
      className={`${shrink} ${className}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 10.5L12 3l9 7.5M5 9.5V20a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V9.5"
      />
    </svg>
  );
}
