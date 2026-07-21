import Link from "next/link";
import { tools, type Tool } from "@/lib/tools.config";

const iconPaths: Record<string, string> = {
  bolt: "M13 10V3L4 14h7v7l9-11h-7z",
  film: "M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z",
  video:
    "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z",
  search: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
};

function ToolIcon({ name }: { name: string }) {
  const d = iconPaths[name] ?? iconPaths.bolt;
  return (
    <svg
      className="w-6 h-6 text-surface-900"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={d} />
    </svg>
  );
}

function ToolCard({ tool }: { tool: Tool }) {
  return (
    <Link href={tool.path} className="contents">
      <div
        className={[
          "group bg-white border border-surface-200 p-5",
          "flex flex-col gap-3",
          "transition-colors duration-fast",
          "hover:bg-surface-50 hover:border-surface-900 cursor-pointer",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-surface-900 truncate">
            {tool.name}
          </h3>
          <ToolIcon name={tool.icon} />
        </div>
        <p className="text-sm text-surface-500 leading-relaxed">
          {tool.description}
        </p>
      </div>
    </Link>
  );
}

export default function HubPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-white border-b border-surface-200">
        <div className="max-w-screen-xl mx-auto px-6 py-8">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-narrow.png"
              alt="Feynman"
              className="h-16 w-auto shrink-0"
            />
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-surface-900 font-display">
                AI Tools
              </h1>
              <p className="text-surface-600 mt-1 text-sm">
                Our homemade AI-powered tools for daily work
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tool grid */}
      <div className="max-w-screen-xl mx-auto px-6 py-8">
        {tools.length === 0 ? (
          <p className="text-surface-500 text-sm">No tools registered yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {tools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
