import { useState } from "react";
import { Badge } from "@workspace/ui";
import { tools, categories, toolHref } from "./tools.config";
import type { Tool } from "./tools.config";

const iconPaths: Record<string, string> = {
  bolt:   "M13 10V3L4 14h7v7l9-11h-7z",
  film:   "M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z",
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
  const isClickable = tool.status !== "coming-soon";
  const isComingSoon = tool.status === "coming-soon";

  const card = (
    <div
      className={[
        "group bg-white border border-surface-200 p-5",
        "flex flex-col gap-3",
        "transition-colors duration-fast",
        isClickable
          ? "hover:bg-surface-50 hover:border-surface-900 cursor-pointer"
          : "opacity-60 cursor-not-allowed",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-lg font-semibold text-surface-900 truncate">
            {tool.name}
          </h3>
          {isComingSoon && (
            <Badge variant="default" size="sm">Coming Soon</Badge>
          )}
        </div>
        <ToolIcon name={tool.icon} />
      </div>
      <p className="text-sm text-surface-500 leading-relaxed">
        {tool.description}
      </p>
    </div>
  );

  if (!isClickable) return card;

  return (
    <a href={toolHref(tool)} className="contents">
      {card}
    </a>
  );
}

export default function App() {
  const [activeCategory, setActiveCategory] = useState<string>("All");

  const filteredTools =
    activeCategory === "All"
      ? tools
      : tools.filter((t) => t.category === activeCategory);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-white border-b border-surface-200">
        <div className="max-w-screen-xl mx-auto px-6 py-8">
          <h1 className="text-3xl font-semibold tracking-tight text-surface-900 font-display">
            Tools Hub
          </h1>
          <p className="text-surface-600 mt-1 text-sm">
            All your AI-powered tools in one place.
          </p>
        </div>
      </div>

      {/* Category filter */}
      <div className="bg-white border-b border-surface-200">
        <div className="max-w-screen-xl mx-auto px-6">
          <div className="flex gap-1 overflow-x-auto py-2">
            {["All", ...categories].map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={[
                  "px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors duration-fast rounded-control",
                  activeCategory === cat
                    ? "bg-black text-white"
                    : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50",
                ].join(" ")}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tool grid */}
      <div className="max-w-screen-xl mx-auto px-6 py-8">
        {filteredTools.length === 0 ? (
          <p className="text-surface-500 text-sm">No tools in this category yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredTools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
