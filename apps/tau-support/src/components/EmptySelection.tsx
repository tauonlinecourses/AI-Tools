export function EmptySelection() {
  return (
    <div
      dir="rtl"
      className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 bg-[#F5F6F8] px-6 text-center"
    >
      <svg
        width="120"
        height="100"
        viewBox="0 0 120 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
        className="text-surface-300"
      >
        <ellipse cx="60" cy="88" rx="36" ry="6" fill="currentColor" opacity="0.35" />
        <rect
          x="48"
          y="28"
          width="44"
          height="36"
          rx="8"
          stroke="currentColor"
          strokeWidth="2"
          fill="white"
        />
        <path
          d="M48 42h-8l-6 8 6 8h8"
          stroke="currentColor"
          strokeWidth="2"
          fill="white"
          strokeLinejoin="round"
        />
        <circle cx="38" cy="22" r="10" stroke="currentColor" strokeWidth="2" fill="white" />
        <path
          d="M34 22h8M38 18v8"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.5"
        />
        <path
          d="M72 48l8 12M80 48l-8 12"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.4"
        />
      </svg>
      <p className="text-sm font-medium text-surface-500">לא נבחרה רשומה</p>
      <p className="max-w-sm text-xs text-surface-400">
        בחרו ״פיד של כל הקורסים״ או קורס מהרשימה, או לחצו ״בדוק הכל״ כדי למשוך
        שרשורים חדשים מכל הקורסים
      </p>
    </div>
  );
}
