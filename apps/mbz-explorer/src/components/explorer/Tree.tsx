import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Spinner } from "@workspace/ui";
import type { MbzActivity, MbzManifest, MbzSection } from "../../lib/mbz-parser";
import {
  buildActivityNodes,
  collectSubsectionCmids,
  decodeSectionIdForActivity,
  getTopLevelSections,
  sectionPending,
  subsectionPending,
  type CourseTreeNode,
} from "../../lib/courseTree";
import { activityTypeIcon } from "../../lib/activityTypeIcon";
import { ChevronDownIcon, HomeIcon } from "../icons";
import { StructureOverview, structureStatsFromManifest } from "./StructureOverview";

interface TreeProps {
  manifest: MbzManifest;
  selectedCmid: string | null;
  homeSelected: boolean;
  decodingSectionId: string | null;
  onSelectHome: () => void;
  onSelectActivity: (cmid: string) => void;
  onExpandSection: (sectionId: string) => void;
  onAnalyzeFull: () => void;
  analyzingFull?: boolean;
}

/** Text fallback when no logo is mapped (hvp → h5p; label → none). */
function activityTypeLabel(type: string): string | null {
  if (type === "label") return null;
  if (type === "hvp") return "h5p";
  return type;
}

export function Tree({
  manifest,
  selectedCmid,
  homeSelected,
  decodingSectionId,
  onSelectHome,
  onSelectActivity,
  onExpandSection,
  onAnalyzeFull,
  analyzingFull,
}: TreeProps) {
  const topLevelSections = useMemo(() => getTopLevelSections(manifest), [manifest]);

  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const openIds = new Set(topLevelSections.slice(0, 2).map((s) => s.id));
    return new Set(topLevelSections.filter((s) => !openIds.has(s.id)).map((s) => s.id));
  });
  const [collapsedSubsections, setCollapsedSubsections] = useState<Set<string>>(
    () => new Set(collectSubsectionCmids(manifest))
  );
  const [overviewOpen, setOverviewOpen] = useState(true);

  const byCmid = useMemo(() => {
    const m = new Map<string, MbzActivity>();
    for (const a of manifest.activities) m.set(a.cmid, a);
    return m;
  }, [manifest.activities]);

  function toggleSection(section: MbzSection) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      const wasCollapsed = next.has(section.id);
      if (wasCollapsed) {
        next.delete(section.id);
        if (sectionPending(manifest, section, byCmid)) onExpandSection(section.id);
      } else {
        next.add(section.id);
      }
      return next;
    });
  }

  function toggleSubsection(node: CourseTreeNode & { kind: "subsection" }) {
    setCollapsedSubsections((prev) => {
      const next = new Set(prev);
      const wasCollapsed = next.has(node.cmid);
      if (wasCollapsed) {
        next.delete(node.cmid);
        if (node.delegatedSectionId && subsectionPending(manifest, node, byCmid)) {
          onExpandSection(node.delegatedSectionId);
        }
      } else {
        next.add(node.cmid);
      }
      return next;
    });
  }

  function handleActivityClick(act: MbzActivity) {
    const decodeId = decodeSectionIdForActivity(manifest, act.cmid);
    if (decodeId) {
      const section = manifest.sections.find((s) => s.id === decodeId);
      if (section && sectionPending(manifest, section, byCmid) && act.contentStatus === "pending") {
        onExpandSection(decodeId);
      }
    }
    onSelectActivity(act.cmid);
  }

  function renderActivityRow(act: MbzActivity, indentClass = "ps-5") {
    const isSelected = !homeSelected && selectedCmid === act.cmid;
    const pending = act.contentStatus === "pending";
    const icon = activityTypeIcon(act.type);
    const typeLabel = icon ? null : activityTypeLabel(act.type);

    return (
      <div
        role="button"
        tabIndex={0}
        id={`activity-${act.cmid}`}
        className={`group flex items-center gap-1.5 mx-2 ${indentClass} pe-2 h-9 rounded-lg cursor-pointer text-base transition-colors duration-fast ${
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
        {icon && (
          <img
            src={icon.src}
            alt=""
            title={icon.label}
            className={`w-4 h-4 shrink-0 object-contain ${
              isSelected && icon.invertWhenSelected ? "brightness-0 invert" : ""
            }`}
          />
        )}
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
        <span className="truncate flex-1">{act.name}</span>
      </div>
    );
  }

  function renderTreeNode(node: CourseTreeNode, depth = 0): ReactNode {
    const indentClass = depth === 0 ? "ps-5" : depth === 1 ? "ps-8" : "ps-11";

    if (node.kind === "activity") {
      const act = byCmid.get(node.cmid);
      if (!act) {
        return (
          <div
            key={node.cmid}
            className={`mx-2 ${indentClass} pe-2 h-8 text-sm text-surface-400 flex items-center`}
          >
            missing {node.cmid}
          </div>
        );
      }
      return <div key={act.cmid}>{renderActivityRow(act, indentClass)}</div>;
    }

    const act = byCmid.get(node.cmid);
    const name = act?.name ?? `subsection ${node.cmid}`;
    const isCollapsed = collapsedSubsections.has(node.cmid);
    const pending = subsectionPending(manifest, node, byCmid);
    const decoding =
      node.delegatedSectionId != null && decodingSectionId === node.delegatedSectionId;

    return (
      <div key={node.cmid} id={`subsection-${node.cmid}`} className="flex flex-col">
        <div
          className={`group flex items-center gap-1.5 mx-2 ${indentClass} pe-2 h-9 text-base font-semibold hover:bg-white transition-colors duration-fast ${
            pending ? "text-surface-500" : "text-surface-800"
          }`}
        >
          <button
            type="button"
            className="p-0.5 text-surface-500 hover:text-surface-900 shrink-0"
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? "Expand subsection" : "Collapse subsection"}
            onClick={() => toggleSubsection(node)}
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
            onClick={() => toggleSubsection(node)}
          >
            {name}
          </button>
          {decoding && <Spinner size="sm" />}
        </div>
        {!isCollapsed && (
          <div className="flex flex-col gap-0.5 pb-0.5">
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
            {node.children.length === 0 && (
              <div className={`mx-2 ${indentClass} pe-2 text-xs text-surface-400 py-1`}>
                Empty subsection
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderSection(section: MbzSection) {
    const isCollapsed = collapsed.has(section.id);
    const pending = sectionPending(manifest, section, byCmid);
    const decoding = decodingSectionId === section.id;
    const nodes = buildActivityNodes(manifest, section);

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
        </div>

        {!isCollapsed && (
          <div className="flex flex-col gap-0.5 pb-1">
            {nodes.map((node) => renderTreeNode(node))}
            {nodes.length === 0 && (
              <div className="mx-2 ps-5 pe-2 text-xs text-surface-400 py-1">Empty section</div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <aside className="w-80 shrink-0 bg-[#F8F9FA] flex flex-col min-h-0 overflow-hidden h-full">
      <div className="p-4 border-b border-surface-200 flex flex-col gap-2 shrink-0">
        <div className="flex flex-col gap-1 min-w-0">
          <span
            className="text-xl font-semibold text-surface-900 leading-snug truncate"
            title={manifest.sourceFile.name}
          >
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
        <div
          role="button"
          tabIndex={0}
          className={`group flex items-center gap-1.5 mx-2 pe-2 h-9 rounded-lg cursor-pointer text-base transition-colors duration-fast ${
            homeSelected
              ? "bg-[#0F6CBF] text-white font-medium"
              : "text-surface-700 hover:bg-white hover:text-surface-900"
          }`}
          onClick={onSelectHome}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelectHome();
            }
          }}
        >
          <HomeIcon
            className={`w-4 h-4 ms-2 shrink-0 ${homeSelected ? "text-white" : "text-surface-500"}`}
          />
          <span className="truncate flex-1">Home</span>
        </div>

        {topLevelSections.length === 0 && (
          <p className="px-4 py-2 text-base text-surface-400">No sections in this backup.</p>
        )}
        {topLevelSections.map((section) => renderSection(section))}
      </nav>
    </aside>
  );
}
