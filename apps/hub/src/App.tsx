import React, { useState } from "react";
import { Badge } from "@workspace/ui";
import { tools, categories } from "./tools.config";
import type { Tool } from "./tools.config";

const statusConfig = {
  live:          { label: "Live",         variant: "success"  as const },
  beta:          { label: "Beta",         variant: "warning"  as const },
  "coming-soon": { label: "Coming Soon",  variant: "default"  as const },
};

function ToolCard({ tool }: { tool: Tool }) {
  const status = statusConfig[tool.status];
  const isClickable = tool.status !== "coming-soon";

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
      <div className="flex items-start justify-between">
        <span className="text-2xl">{tool.icon}</span>
        <Badge variant={status.variant} size="sm">{status.label}</Badge>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-surface-900">
          {tool.name}
        </h3>
        <p className="text-xs text-surface-500 mt-1 leading-relaxed">
          {tool.description}
        </p>
      </div>
      {isClickable && (
        <span className="text-xs text-surface-900 font-semibold flex items-center gap-1 mt-auto">
          Open tool
          <svg className="w-3 h-3 group-hover:translate-x-0.5 transition-transform duration-fast" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </span>
      )}
    </div>
  );

  if (!isClickable) return card;

  return (
    <a href={tool.url} target="_blank" rel="noopener noreferrer" className="contents">
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
