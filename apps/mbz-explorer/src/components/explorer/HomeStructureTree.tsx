import { useMemo, useState, type ReactNode } from "react";
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
import { ChevronDownIcon, FolderIcon, FileIcon } from "../icons";
import { StructureOverview, structureStatsFromManifest } from "./StructureOverview";

interface HomeStructureTreeProps {
  manifest: MbzManifest;
  onSelectActivity: (cmid: string) => void;
  onExpandSection: (sectionId: string) => void;
  onSelectOverviewType?: (type: string) => void;
  selectedOverviewType?: string | null;
}

function activityTypeLabel(type: string): string | null {
  if (type === "label") return null;
  if (type === "hvp") return "h5p";
  return type;
}

export function HomeStructureTree({
  manifest,
  onSelectActivity,
  onExpandSection,
  onSelectOverviewType,
  selectedOverviewType,
}: HomeStructureTreeProps) {
  const topLevelSections = useMemo(() => getTopLevelSections(manifest), [manifest]);

  const byCmid = useMemo(() => {
    const m = new Map<string, MbzActivity>();
    for (const a of manifest.activities) m.set(a.cmid, a);
    return m;
  }, [manifest.activities]);

  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(topLevelSections.map((s) => s.id))
  );
  const [collapsedSubsections, setCollapsedSubsections] = useState<Set<string>>(
    () => new Set(collectSubsectionCmids(manifest))
  );
  const [rootOpen, setRootOpen] = useState(true);

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
      if (
        section &&
        sectionPending(manifest, section, byCmid) &&
        act.contentStatus === "pending"
      ) {
        onExpandSection(decodeId);
      }
    }
    onSelectActivity(act.cmid);
  }

  function renderActivityFile(act: MbzActivity, depth: number): ReactNode {
    const pendingAct = act.contentStatus === "pending";
    const icon = activityTypeIcon(act.type);
    const typeLabel = icon ? null : activityTypeLabel(act.type);
    const indent = depth === 0 ? "ps-1" : depth === 1 ? "ps-4" : "ps-7";

    return (
      <button
        key={act.cmid}
        type="button"
        className={`group w-full flex items-center gap-2 py-1.5 ${indent} pe-2 rounded-control text-left transition-colors duration-fast ${
          pendingAct
            ? "text-surface-500 hover:bg-surface-50 hover:text-surface-700"
            : "text-surface-700 hover:bg-[#0F6CBF]/[0.08] hover:text-surface-900"
        }`}
        onClick={() => handleActivityClick(act)}
      >
        <span className="w-3.5 shrink-0" aria-hidden />
        {icon ? (
          <img
            src={icon.src}
            alt=""
            title={icon.label}
            className="w-4 h-4 shrink-0 object-contain"
          />
        ) : (
          <FileIcon className="w-4 h-4 shrink-0 text-surface-400" />
        )}
        {typeLabel && (
          <span className="shrink-0 text-xs text-surface-400">{typeLabel}</span>
        )}
        <span className="truncate flex-1">{act.name}</span>
      </button>
    );
  }

  function renderTreeNode(node: CourseTreeNode, depth = 0): ReactNode {
    if (node.kind === "activity") {
      const act = byCmid.get(node.cmid);
      if (!act) {
        return (
          <div
            key={node.cmid}
            className="flex items-center gap-2 py-1 ps-6 text-surface-400"
          >
            <FileIcon className="w-4 h-4 shrink-0" />
            missing {node.cmid}
          </div>
        );
      }
      return renderActivityFile(act, depth);
    }

    const act = byCmid.get(node.cmid);
    const name = act?.name ?? `subsection ${node.cmid}`;
    const isCollapsed = collapsedSubsections.has(node.cmid);
    const pending = subsectionPending(manifest, node, byCmid);
    const indent = depth === 0 ? "" : depth === 1 ? "ms-3 border-s border-surface-200 ps-3" : "ms-3 border-s border-surface-200 ps-3";

    return (
      <div key={node.cmid} className={indent}>
        <div
          className={`flex items-center gap-2 py-1.5 rounded-control hover:bg-surface-50 ${
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
          <FolderIcon className="w-4 h-4 text-amber-600 shrink-0" />
          <button
            type="button"
            className="truncate text-left flex-1 font-semibold"
            onClick={() => toggleSubsection(node)}
          >
            {name}
          </button>
          <span className="text-xs text-surface-400 shrink-0 tabular-nums">
            {node.children.length}
          </span>
        </div>
        {!isCollapsed && (
          <div className="ms-3 border-s border-surface-200 ps-3">
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
            {node.children.length === 0 && (
              <p className="py-1 ps-6 text-xs text-surface-400">Empty subsection</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0 min-w-0 bg-white">
      <div className="border-b border-surface-200 px-6 py-4 shrink-0">
        <h2 className="text-lg font-semibold text-surface-900">Course structure</h2>
        <p className="text-sm text-surface-500 mt-1">
          Folder tree of sections and activities. Click a file to open it.
        </p>
        <div className="mt-3">
          <StructureOverview
            stats={structureStatsFromManifest(manifest)}
            compact
            selectedType={selectedOverviewType}
            onSelectType={onSelectOverviewType}
            selectableTypes={["resource"]}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="text-base text-surface-800 max-w-3xl">
          <div className="flex items-center gap-2 py-1.5">
            <button
              type="button"
              className="p-0.5 text-surface-500 hover:text-surface-900 shrink-0"
              aria-expanded={rootOpen}
              aria-label={rootOpen ? "Collapse backup" : "Expand backup"}
              onClick={() => setRootOpen((v) => !v)}
            >
              <ChevronDownIcon
                className={`w-3.5 h-3.5 transition-transform duration-fast ${
                  rootOpen ? "" : "-rotate-90"
                }`}
              />
            </button>
            <FolderIcon className="w-4 h-4 text-amber-600" />
            <span className="font-semibold truncate" title={manifest.sourceFile.name}>
              {manifest.sourceFile.name}
            </span>
          </div>

          {rootOpen && (
            <div className="ms-3 border-s border-surface-200 ps-3 space-y-0.5">
              {topLevelSections.length === 0 && (
                <p className="py-2 text-surface-400">No sections in this backup.</p>
              )}
              {topLevelSections.map((section) => {
                const isCollapsed = collapsed.has(section.id);
                const pending = sectionPending(manifest, section, byCmid);
                const nodes = buildActivityNodes(manifest, section);

                return (
                  <div key={section.id}>
                    <div
                      className={`flex items-center gap-2 py-1.5 rounded-control hover:bg-surface-50 ${
                        pending ? "text-surface-500" : "text-surface-800"
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
                      <FolderIcon className="w-4 h-4 text-amber-600 shrink-0" />
                      <button
                        type="button"
                        className="truncate text-left flex-1 font-semibold"
                        onClick={() => toggleSection(section)}
                      >
                        {section.name}
                      </button>
                      <span className="text-xs text-surface-400 shrink-0 tabular-nums">
                        {nodes.length}
                      </span>
                    </div>

                    {!isCollapsed && (
                      <div className="ms-3 border-s border-surface-200 ps-3">
                        {nodes.map((node) => renderTreeNode(node))}
                        {nodes.length === 0 && (
                          <p className="py-1 ps-6 text-xs text-surface-400">Empty section</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
