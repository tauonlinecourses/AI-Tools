import type { MbzActivity, MbzManifest, MbzSection } from "./mbz-parser";

export type CourseTreeNode =
  | { kind: "activity"; cmid: string }
  | {
      kind: "subsection";
      cmid: string;
      delegatedSectionId: string;
      children: CourseTreeNode[];
    };

/** Sections shown at course root — excludes delegated subsection content sections. */
export function getTopLevelSections(manifest: MbzManifest): MbzSection[] {
  return [...manifest.sections]
    .filter((s) => !s.delegatedBy)
    .sort((a, b) => a.number - b.number);
}

export function getDelegatedSection(
  manifest: MbzManifest,
  subsectionCmid: string
): MbzSection | undefined {
  return manifest.sections.find((s) => s.delegatedBy === subsectionCmid);
}

/** Activity tree for one section; subsection activities become nested folders. */
export function buildActivityNodes(
  manifest: MbzManifest,
  section: MbzSection
): CourseTreeNode[] {
  const byCmid = new Map(manifest.activities.map((a) => [a.cmid, a]));
  const nodes: CourseTreeNode[] = [];

  for (const cmid of section.activityRefs) {
    const act = byCmid.get(cmid);
    if (!act) continue;

    if (act.type === "subsection") {
      const delegated = getDelegatedSection(manifest, act.cmid);
      const children = delegated ? buildActivityNodes(manifest, delegated) : [];
      nodes.push({
        kind: "subsection",
        cmid: act.cmid,
        delegatedSectionId: delegated?.id ?? "",
        children,
      });
    } else {
      nodes.push({ kind: "activity", cmid });
    }
  }
  return nodes;
}

function collectActivityCmids(node: CourseTreeNode, out: string[]): void {
  if (node.kind === "activity") {
    out.push(node.cmid);
    return;
  }
  for (const child of node.children) {
    collectActivityCmids(child, out);
  }
}

/** All activity cmids under a section, including inside subsection folders. */
export function sectionActivityCmids(manifest: MbzManifest, section: MbzSection): string[] {
  const out: string[] = [];
  for (const node of buildActivityNodes(manifest, section)) {
    collectActivityCmids(node, out);
  }
  return out;
}

export function sectionPending(
  manifest: MbzManifest,
  section: MbzSection,
  byCmid?: Map<string, MbzActivity>
): boolean {
  const map = byCmid ?? new Map(manifest.activities.map((a) => [a.cmid, a]));
  if (section.summaryStatus === "pending") return true;
  for (const cmid of sectionActivityCmids(manifest, section)) {
    if (map.get(cmid)?.contentStatus === "pending") return true;
  }
  return false;
}

export function subsectionPending(
  manifest: MbzManifest,
  node: CourseTreeNode & { kind: "subsection" },
  byCmid?: Map<string, MbzActivity>
): boolean {
  const map = byCmid ?? new Map(manifest.activities.map((a) => [a.cmid, a]));
  const delegated = manifest.sections.find((s) => s.id === node.delegatedSectionId);
  if (delegated?.summaryStatus === "pending") return true;
  for (const child of node.children) {
    if (child.kind === "activity") {
      if (map.get(child.cmid)?.contentStatus === "pending") return true;
    } else if (subsectionPending(manifest, child, map)) {
      return true;
    }
  }
  return false;
}

/** Section whose activities should be decoded for this activity cmid. */
export function decodeSectionIdForActivity(
  manifest: MbzManifest,
  cmid: string
): string | null {
  const direct = manifest.sections.find((s) => s.activityRefs.includes(cmid));
  if (direct) return direct.id;
  for (const section of manifest.sections) {
    if (section.delegatedBy && section.activityRefs.includes(cmid)) {
      return section.id;
    }
  }
  return null;
}

export function collectSubsectionCmids(manifest: MbzManifest): string[] {
  return manifest.activities.filter((a) => a.type === "subsection").map((a) => a.cmid);
}
