const iconPaths: Record<string, string | string[]> = {
  bolt:   "M13 10V3L4 14h7v7l9-11h-7z",
  film:   "M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z",
  book:   "M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 016.5 22H20V2H6.5A2.5 2.5 0 004 4.5v15z",
  search: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  zip:    "M8 3h6l5 5v11a2 2 0 01-2 2H8a2 2 0 01-2-2V5a2 2 0 012-2zm5 1.5V9h4.5M11 7h2M11 10h2M11 13h2M11 16h2",
  "page-question": [
    "M15 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7z",
    "M9.1 9a3 3 0 015.82 1c0 2-3 3-3 3",
    "M12 17h.01",
  ],
};

export function ToolIcon({ name }: { name: string }) {
  const paths = iconPaths[name] ?? iconPaths.bolt;
  const dList = Array.isArray(paths) ? paths : [paths];
  return (
    <svg
      className="w-6 h-6 text-surface-900"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden
    >
      {dList.map((d) => (
        <path key={d} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={d} />
      ))}
    </svg>
  );
}
