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
