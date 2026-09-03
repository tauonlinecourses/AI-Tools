import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { Badge, persistHubLocale } from "@workspace/ui";
import { tools, categories, toolHrefWithLocale } from "./tools.config";
import type { Tool } from "./tools.config";
import {
  ui,
  localizeCategory,
  localizeTool,
  type Locale,
} from "./i18n";

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

function ToolIcon({ name }: { name: string }) {
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

function ToolCard({ tool, locale }: { tool: Tool; locale: Locale }) {
  const isClickable = tool.status !== "coming-soon";
  const isComingSoon = tool.status === "coming-soon";
  const copy = localizeTool(locale, tool);
  const t = ui[locale];

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
            {copy.name}
          </h3>
          {isComingSoon && (
            <Badge variant="default" size="sm">{t.comingSoon}</Badge>
          )}
        </div>
        <ToolIcon name={tool.icon} />
      </div>
      <p className="text-sm text-surface-500 leading-relaxed">
        {copy.description}
      </p>
    </div>
  );

  if (!isClickable) return card;

  return (
    <a href={toolHrefWithLocale(tool, locale)} className="contents">
      {card}
    </a>
  );
}

function HubPage({ locale }: { locale: Locale }) {
  const t = ui[locale];
  const [activeCategory, setActiveCategory] = useState<string>("All");

  useEffect(() => {
    document.documentElement.lang = t.htmlLang;
    document.documentElement.dir = t.dir;
    document.title = t.title;
    persistHubLocale(locale);
  }, [t, locale]);

  const filteredTools =
    activeCategory === "All"
      ? tools
      : tools.filter((tool) => tool.category === activeCategory);

  const categoryTabs = ["All", ...categories] as const;

  return (
    <div className="min-h-screen bg-white" dir={t.dir} lang={t.htmlLang}>
      {/* Header */}
      <div className="bg-white border-b border-surface-200">
        <div className="max-w-screen-xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <Link to={locale === "en" ? "/en" : "/"} className="shrink-0">
                <img
                  src="/logo-narrow.png"
                  alt="Feynman"
                  className="h-16 w-auto"
                />
              </Link>
              <div className="min-w-0">
                <h1 className="text-3xl font-semibold tracking-tight text-surface-900 font-display">
                  {t.title}
                </h1>
                <p className="text-surface-600 mt-1 text-sm">
                  {t.subtitle}
                </p>
              </div>
            </div>
            <Link
              to={t.langHref}
              className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-control border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors duration-fast"
            >
              {t.langLabel}
            </Link>
          </div>
        </div>
      </div>

      {/* Category filter */}
      <div className="bg-white border-b border-surface-200">
        <div className="max-w-screen-xl mx-auto px-6">
          <div className="flex gap-1 overflow-x-auto py-2">
            {categoryTabs.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={[
                  "px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors duration-fast rounded-control",
                  activeCategory === cat
                    ? "bg-black text-white"
                    : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50",
                ].join(" ")}
              >
                {cat === "All" ? t.all : localizeCategory(locale, cat)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tool grid */}
      <div className="max-w-screen-xl mx-auto px-6 py-8">
        {filteredTools.length === 0 ? (
          <p className="text-surface-500 text-sm">{t.empty}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredTools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} locale={locale} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HubPage locale="he" />} />
      <Route path="/en" element={<HubPage locale="en" />} />
      <Route path="/he" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
