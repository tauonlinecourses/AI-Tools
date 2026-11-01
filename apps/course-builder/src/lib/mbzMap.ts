/**
 * Pure MBZ → Course Builder mapping (no Supabase). Used by import + unit tests.
 */

import {
  buildActivityNodes,
  extractHtmlLikeRaw,
  getTopLevelSections,
  unescapeXmlEntities,
  vfsText,
  type CourseTreeNode,
  type MbzActivity,
  type MbzManifest,
  type MbzSection,
  type MbzVfs,
} from "@workspace/mbz-parser";
import {
  isMbzEditableModtype,
  type ActivityBindingMeta,
  type MbzEditableModtype,
  type SectionBindingMeta,
} from "./mbzTypes";
import { mapHvpActivityToComponents } from "./mbzHvpMap";
import { splitMoodleHtmlToComponents, type MappedComponent } from "./mbzHtmlSplit";

export type { MappedComponent };

export interface MappedPage {
  tempKey: string;
  sectionTempKey: string;
  title: string;
  position: number;
  components: MappedComponent[];
  binding: {
    moodleId: string;
    modtype: MbzEditableModtype;
    activityDir: string;
    payloadField: string | null;
    meta: ActivityBindingMeta;
  };
}

export interface MappedSection {
  tempKey: string;
  title: string;
  position: number;
  moodleId: string;
  meta: SectionBindingMeta;
  /** When true, only a Moodle binding is stored (delegated subsection section); no CB section row. */
  bindingOnly?: boolean;
  /** For bindingOnly: CB section tempKey that owns the nested pages. */
  parentCbSectionTempKey?: string;
}

export interface MbzCourseMapping {
  courseTitle: string;
  courseDescription: string | null;
  moodleVersion: string;
  sections: MappedSection[];
  pages: MappedPage[];
  /** Editable cmids discovered during mapping. */
  editableCmids: string[];
  warnings: string[];
}

function extractTagRaw(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const matches = xml.match(new RegExp(re.source, "gi"));
  if (!matches?.length) return null;
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i]!.match(re);
    const body = m?.[1]?.trim() ?? "";
    if (body && body !== "$@NULL@$") return body;
  }
  return null;
}

function rawField(vfs: MbzVfs, activity: MbzActivity, field: string): string | null {
  const xml = vfsText(vfs, activity.rawXmlPath);
  if (!xml) return null;
  const body = extractTagRaw(xml, field);
  if (!body) return null;
  return unescapeXmlEntities(body);
}

function primaryResourceFilename(manifest: MbzManifest, activity: MbzActivity): string | null {
  // Prefer a file whose path context matches this activity; fall back to first non-dot file
  // referenced near the activity. files.xml does not always expose context here — use name heuristic.
  const content = activity.content;
  if (content?.kind === "html" && content.referencedFiles[0]) {
    return content.referencedFiles[0].originalFilename;
  }
  // Heuristic: files often named after the resource
  const hit = manifest.files.find((f) =>
    f.originalFilename.toLowerCase().includes(activity.name.slice(0, 12).toLowerCase())
  );
  return hit?.originalFilename ?? manifest.files[0]?.originalFilename ?? null;
}

function mapBoardActivity(vfs: MbzVfs, activity: MbzActivity): MappedComponent[] {
  const intro = rawField(vfs, activity, "intro");
  const components: MappedComponent[] = intro?.trim()
    ? splitMoodleHtmlToComponents(intro)
    : [];

  const xml = vfsText(vfs, activity.rawXmlPath) ?? "";
  const colNames: string[] = [];
  const colRe = /<column\b[^>]*>[\s\S]*?<name>([\s\S]*?)<\/name>/gi;
  let m: RegExpExecArray | null;
  while ((m = colRe.exec(xml)) != null) {
    const name = unescapeXmlEntities(m[1].trim());
    if (name && name !== "$@NULL@$") colNames.push(name);
  }
  const columns =
    colNames.length > 0
      ? colNames.map((title) => ({
          id: crypto.randomUUID(),
          title: title === "כותרת" ? "" : title,
          items: [] as string[],
        }))
      : [
          { id: crypto.randomUUID(), title: "", items: [] as string[] },
          { id: crypto.randomUUID(), title: "", items: [] as string[] },
          { id: crypto.randomUUID(), title: "", items: [] as string[] },
        ];

  components.push({
    type: "notes_board",
    position: components.length,
    props: {
      description: "",
      columns,
    },
  });
  components.forEach((c, i) => {
    c.position = i;
  });
  return components;
}

function mapEditableActivity(
  vfs: MbzVfs,
  manifest: MbzManifest,
  activity: MbzActivity,
  section: MbzSection,
  pageTempKey: string,
  sectionTempKey: string,
  position: number
): MappedPage {
  const modtype = activity.type as MbzEditableModtype;
  let components: MappedComponent[] = [];
  let payloadField: string | null = null;
  let introHtml: string | null = null;
  let resourceFilename: string | null = null;

  if (modtype === "hvp") {
    // Content maps into CB blocks; H5P JSON is not rewritten on MBZ export (name/sequence only).
    payloadField = null;
    const mapped = mapHvpActivityToComponents(vfs, activity);
    components = mapped.components;
    introHtml = mapped.introHtml;
  } else if (modtype === "board") {
    payloadField = "intro";
    components = mapBoardActivity(vfs, activity);
    introHtml = rawField(vfs, activity, "intro");
  } else if (modtype === "url") {
    const external = rawField(vfs, activity, "externalurl");
    const intro = rawField(vfs, activity, "intro");
    payloadField = "externalurl";
    introHtml = intro;
    if (intro?.trim()) {
      components.push(...splitMoodleHtmlToComponents(intro));
    }
    components.push({
      type: "button",
      position: components.length,
      props: {
        text: activity.name || "קישור",
        url: external?.trim() || "",
        align: "center",
      },
    });
  } else if (modtype === "resource") {
    const extracted = extractHtmlLikeRaw(vfs, activity);
    payloadField = extracted?.field ?? "intro";
    const html = extracted ? unescapeXmlEntities(extracted.value) : "";
    resourceFilename = primaryResourceFilename(manifest, activity);
    if (html.trim()) {
      components.push(...splitMoodleHtmlToComponents(html));
    }
    components.push({
      type: "button",
      position: components.length,
      props: {
        text: resourceFilename || "קובץ מצורף",
        url: "",
        align: "center",
      },
    });
  } else {
    // page / label — split Moodle HTML into banner / video / image / CTA / text
    const extracted = extractHtmlLikeRaw(vfs, activity);
    payloadField = extracted?.field ?? (modtype === "label" ? "intro" : "content");
    const html = extracted ? unescapeXmlEntities(extracted.value) : "";
    components = splitMoodleHtmlToComponents(html);
  }

  components.forEach((c, i) => {
    c.position = i;
  });

  return {
    tempKey: pageTempKey,
    sectionTempKey,
    title: activity.name || `${modtype} ${activity.cmid}`,
    position,
    components,
    binding: {
      moodleId: activity.cmid,
      modtype,
      activityDir: activity.activityDir,
      payloadField,
      meta: {
        originalName: activity.name,
        parentSectionMoodleId: section.id,
        introHtml,
        resourceFilename,
      },
    },
  };
}

/**
 * Collect mapped pages under one Moodle section's activity tree.
 * Subsection children are attributed to the delegated Moodle section for sequence rebuild,
 * but still become CB pages under the top-level CB section.
 */
function walkNodes(
  vfs: MbzVfs,
  manifest: MbzManifest,
  owningMoodleSection: MbzSection,
  nodes: CourseTreeNode[],
  cbSectionTempKey: string,
  byCmid: Map<string, MbzActivity>,
  pages: MappedPage[],
  editableCmids: string[],
  /** mutable bag: moodleSectionId → preserved cmids in that section */
  preservedBySection: Map<string, string[]>,
  warnings: string[],
  positionStart: { n: number },
  /** mutable bag: moodleSectionId → ordered editable cmids encountered */
  editableBySection: Map<string, string[]>
): void {
  const pushPreserved = (sectionId: string, cmid: string) => {
    const list = preservedBySection.get(sectionId) ?? [];
    list.push(cmid);
    preservedBySection.set(sectionId, list);
  };
  const pushEditable = (sectionId: string, cmid: string) => {
    const list = editableBySection.get(sectionId) ?? [];
    list.push(cmid);
    editableBySection.set(sectionId, list);
  };

  for (const node of nodes) {
    if (node.kind === "subsection") {
      pushPreserved(owningMoodleSection.id, node.cmid);
      const delegated = manifest.sections.find((s) => s.id === node.delegatedSectionId);
      if (!delegated) {
        warnings.push(`Delegated section missing for subsection cmid ${node.cmid}`);
        continue;
      }
      // Nested activities belong to the delegated section's sequence
      walkNodes(
        vfs,
        manifest,
        delegated,
        node.children,
        cbSectionTempKey,
        byCmid,
        pages,
        editableCmids,
        preservedBySection,
        warnings,
        positionStart,
        editableBySection
      );
      continue;
    }

    const activity = byCmid.get(node.cmid);
    if (!activity) {
      warnings.push(`Activity cmid ${node.cmid} missing from manifest`);
      pushPreserved(owningMoodleSection.id, node.cmid);
      continue;
    }

    if (isMbzEditableModtype(activity.type)) {
      const pageTempKey = crypto.randomUUID();
      pages.push(
        mapEditableActivity(
          vfs,
          manifest,
          activity,
          owningMoodleSection,
          pageTempKey,
          cbSectionTempKey,
          positionStart.n++
        )
      );
      editableCmids.push(activity.cmid);
      pushEditable(owningMoodleSection.id, activity.cmid);
    } else {
      pushPreserved(owningMoodleSection.id, activity.cmid);
    }
  }
}

/** Map a fully-built MBZ manifest (+ VFS for raw fields) into CB-shaped structures. */
export function mapMbzToCourse(manifest: MbzManifest, vfs: MbzVfs): MbzCourseMapping {
  const warnings = [...manifest.warnings];
  const byCmid = new Map(manifest.activities.map((a) => [a.cmid, a]));
  const sections: MappedSection[] = [];
  const pages: MappedPage[] = [];
  const editableCmids: string[] = [];
  const preservedBySection = new Map<string, string[]>();
  const editableBySection = new Map<string, string[]>();
  /** Moodle section ids that need bindings (top-level + delegated). */
  const moodleSectionsNeeded = new Set<string>();

  const top = getTopLevelSections(manifest);
  let sectionPos = 0;

  for (const section of top) {
    const sectionTempKey = crypto.randomUUID();
    const positionStart = { n: 0 };
    const nodes = buildActivityNodes(manifest, section);
    moodleSectionsNeeded.add(section.id);

    walkNodes(
      vfs,
      manifest,
      section,
      nodes,
      sectionTempKey,
      byCmid,
      pages,
      editableCmids,
      preservedBySection,
      warnings,
      positionStart,
      editableBySection
    );

    // Also bind any delegated sections referenced under this tree
    for (const node of nodes) {
      if (node.kind === "subsection" && node.delegatedSectionId) {
        moodleSectionsNeeded.add(node.delegatedSectionId);
      }
    }

    sections.push({
      tempKey: sectionTempKey,
      title: section.name,
      position: sectionPos++,
      moodleId: section.id,
      meta: {
        originalSequence: [...section.activityRefs],
        preservedCmids: [...new Set(preservedBySection.get(section.id) ?? [])],
        sectionNumber: section.number,
      },
    });
  }

  // Extra section bindings for delegated Moodle sections (no CB section row)
  for (const moodleId of moodleSectionsNeeded) {
    if (sections.some((s) => s.moodleId === moodleId)) continue;
    const moodleSection = manifest.sections.find((s) => s.id === moodleId);
    if (!moodleSection) continue;
    const childPage = pages.find((p) => p.binding.meta.parentSectionMoodleId === moodleId);
    const parentCbTempKey = childPage?.sectionTempKey;
    if (!parentCbTempKey) continue;

    sections.push({
      tempKey: `delegated:${moodleId}`,
      title: moodleSection.name,
      position: -1,
      moodleId,
      bindingOnly: true,
      parentCbSectionTempKey: parentCbTempKey,
      meta: {
        originalSequence: [...moodleSection.activityRefs],
        preservedCmids: [...new Set(preservedBySection.get(moodleId) ?? [])],
        sectionNumber: moodleSection.number,
      },
    });
  }

  void editableBySection;

  return {
    courseTitle: manifest.course.fullname || "קורס מיובא",
    courseDescription: manifest.course.shortname || null,
    moodleVersion: manifest.course.moodleVersion,
    sections,
    pages,
    editableCmids,
    warnings,
  };
}
