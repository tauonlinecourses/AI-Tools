import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Spinner } from "@workspace/ui";
import type { MbzActivity, MbzManifest, MbzSection } from "../../lib/mbz-parser";
import { ChevronDownIcon } from "../icons";
import { StructureOverview, structureStatsFromManifest } from "./StructureOverview";

interface TreeProps {
  manifest: MbzManifest;
  selectedCmid: string | null;
  decodingSectionId: string | null;
  onSelectActivity: (cmid: string) => void;
  onExpandSection: (sectionId: string) => void;
  onJumpToSection: (sectionId: string) => void;
  onAnalyzeFull: () => void;
  analyzingFull?: boolean;
}

function activityTypeLabel(type: string): string | null {
  if (type === "label") return null;
  if (type === "hvp") return "h5p";
  return type;
}

export function Tree({
  manifest,
  selectedCmid,
  decodingSectionId,
  onSelectActivity,
  onExpandSection,
  onJumpToSection,
  onAnalyzeFull,
  analyzingFull,
}: TreeProps) {
  const sortedSections = useMemo(
    () => [...manifest.sections].sort((a, b) => a.number - b.number),
    [manifest.sections]
  );

  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    // First two sections open (eager-decoded); rest collapsed.
    const openIds = new Set(sortedSections.slice(0, 2).map((s) => s.id));
    return new Set(sortedSections.filter((s) => !openIds.has(s.id)).map((s) => s.id));
  });
  const [overviewOpen, setOverviewOpen] = useState(true);

  const byCmid = useMemo(() => {
    const m = new Map<string, MbzActivity>();
    for (const a of manifest.activities) m.set(a.cmid, a);
    return m;
  }, [manifest.activities]);

  const sectionPending = (section: MbzSection) => {
    if (section.summaryStatus === "pending") return true;
    return section.activityRefs.some((id) => byCmid.get(id)?.contentStatus === "pending");
  };

  function toggleSection(section: MbzSection) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      const wasCollapsed = next.has(section.id);
      if (wasCollapsed) {
        next.delete(section.id);
        if (sectionPending(section)) onExpandSection(section.id);
      } else {
        next.add(section.id);
      }
      return next;
    });
  }

  function handleActivityClick(act: MbzActivity) {
    if (act.type === "subsection") {
      const delegated = manifest.sections.find((s) => s.delegatedBy === act.cmid);
      if (delegated) {
        setCollapsed((prev) => {
          const next = new Set(prev);
          next.delete(delegated.id);
          return next;
        });
        onJumpToSection(delegated.id);
        if (sectionPending(delegated)) onExpandSection(delegated.id);
        return;
      }
    }
    const parent = manifest.sections.find((s) => s.activityRefs.includes(act.cmid));
    if (parent && sectionPending(parent) && act.contentStatus === "pending") {
      onExpandSection(parent.id);
    }
    onSelectActivity(act.cmid);
  }

  function renderActivityRow(act: MbzActivity) {
    const isSelected = selectedCmid === act.cmid;
    const pending = act.contentStatus === "pending";
    const isSub = act.type === "subsection";
    const typeLabel = activityTypeLabel(act.type);

    return (
      <div
        role="button"
        tabIndex={0}
        id={`activity-${act.cmid}`}
        className={`group flex items-center gap-1.5 mx-2 ps-5 pe-2 h-9 rounded-lg cursor-pointer text-base transition-colors duration-fast ${
          isSelected
            ? "bg-[#0F6CBF] text-white font-medium"
            : pending
              ? "text-surface-500 hover:bg-white hover:text-surface-700"
              : "text-surface-600 hover:bg-white hover:text-surface-900"
        }`}
        onClick={() => handleActivityClick(act)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleActivityClick(act);
          }
        }}
      >
        {typeLabel && (
          <>
            <span className="shrink-0">{typeLabel}</span>
            <span
              className={`shrink-0 ${isSelected ? "text-white/70" : "text-surface-400"}`}
              aria-hidden
            >
              |
            </span>
          </>
        )}
        <span className="truncate flex-1">
          {act.name}
          {isSub ? " →" : ""}
        </span>
      </div>
    );
  }

  function renderSection(section: MbzSection) {
    const isCollapsed = collapsed.has(section.id);
    const pending = sectionPending(section);
    const decoding = decodingSectionId === section.id;

    return (
      <div key={section.id} id={`section-${section.id}`} className="flex flex-col">
        <div
          className={`group flex items-center gap-1.5 px-2 h-10 text-base font-semibold hover:bg-white transition-colors duration-fast ${
            pending ? "text-surface-500" : "text-surface-900"
          }`}
        >
          <button
            type="button"
            className="p-0.5 text-surface-500 hover:text-surface-900 shrink-0"
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? "Expand section" : "Collapse section"}
            onClick={() => toggleSection(section)}
          >
            <ChevronDownIcon
              className={`w-3.5 h-3.5 transition-transform duration-fast ${
                isCollapsed ? "-rotate-90" : ""
              }`}
            />
          </button>
          <button
            type="button"
            className="truncate flex-1 text-left"
            onClick={() => toggleSection(section)}
          >
            {section.name}
          </button>
          {decoding && <Spinner size="sm" />}
          {pending && !decoding && (
            <span className="text-xs text-surface-400 shrink-0 pe-1">pending</span>
          )}
          {section.delegatedBy && (
            <span className="text-xs text-surface-400 shrink-0 pe-1">sub</span>
          )}
        </div>

        {!isCollapsed && (
          <div className="flex flex-col gap-0.5 pb-1">
            {section.activityRefs.map((cmid) => {
              const act = byCmid.get(cmid);
              if (!act) {
                return (
                  <div
                    key={cmid}
                    className="mx-2 ps-5 pe-2 h-8 text-sm text-surface-400 flex items-center"
                  >
                    missing {cmid}
                  </div>
                );
              }
              return <div key={act.cmid}>{renderActivityRow(act)}</div>;
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <aside className="w-80 shrink-0 bg-[#F8F9FA] flex flex-col min-h-0 overflow-hidden h-full">
      <div className="p-4 border-b border-surface-200 flex flex-col gap-2 shrink-0">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-xl font-semibold text-surface-900 leading-snug truncate" title={manifest.sourceFile.name}>
            {manifest.sourceFile.name}
          </span>
          {manifest.course.fullname !== manifest.sourceFile.name && (
            <span className="text-sm text-surface-500 truncate" title={manifest.course.fullname}>
              {manifest.course.fullname}
            </span>
          )}
        </div>
        <Link
          to="/"
          className="text-sm text-surface-500 hover:text-surface-900 transition-colors duration-fast self-start"
        >
          Back to dashboard
        </Link>

        <div className="pt-1 flex flex-col gap-2">
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm font-semibold text-surface-700 hover:text-surface-900 self-start"
            onClick={() => setOverviewOpen((v) => !v)}
          >
            <ChevronDownIcon
              className={`w-3.5 h-3.5 transition-transform duration-fast ${
                overviewOpen ? "" : "-rotate-90"
              }`}
            />
            Structure overview
          </button>
          {overviewOpen && (
            <StructureOverview stats={structureStatsFromManifest(manifest)} compact />
          )}
          <button
            type="button"
            onClick={onAnalyzeFull}
            disabled={analyzingFull}
            className="w-full h-8 px-3 text-sm font-semibold rounded-control bg-black text-white hover:bg-gray-900 disabled:bg-surface-200 disabled:text-surface-500 transition-colors duration-fast"
          >
            {analyzingFull ? (
              <span className="inline-flex items-center gap-2 justify-center">
                <Spinner size="sm" /> Analyzing…
              </span>
            ) : (
              "Analyze full course"
            )}
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {sortedSections.length === 0 && (
          <p className="px-4 py-2 text-base text-surface-400">No sections in this backup.</p>
        )}
        {sortedSections.map((section) => renderSection(section))}
      </nav>
    </aside>
  );
}
