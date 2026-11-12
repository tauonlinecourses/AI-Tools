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
import { mapHomeExtraActivity, mapHomeSectionSummary } from "./mbzHomeMap";
import { mapHvpActivityToComponents } from "./mbzHvpMap";
import { splitMoodleHtmlToComponents, type MappedComponent } from "./mbzHtmlSplit";
import {
  buildPluginfileUrlMap,
  resolveComponentMediaUrls,
  type PluginfileUrlMap,
} from "./mbzPluginfileUrls";

export type { MappedComponent };

export interface MappedPage {
  tempKey: string;
  sectionTempKey: string;
  title: string;
  position: number;
  components: MappedComponent[];
  /**
   * Content belongs on the built-in CB home page ("עמוד ראשי"),
   * not under a lesson section.
   */
  isCourseHome?: boolean;
  /**
   * Display-only home extras (unilabel / learningmap / …) — no MBZ content rewrite.
   * Still stored as a binding with editable=false.
   */
  oneWayHomeExtra?: boolean;
  /**
   * Section-summary HTML mapped onto home — no activity binding; ranges live on the section meta.
   */
  fromSectionSummary?: boolean;
  binding: {
    moodleId: string;
    modtype: MbzEditableModtype | string;
    activityDir: string | null;
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
  /**
   * Moodle general / "עמוד ראשי" section — no CB lesson;
   * activities go on the course home page. Binding `cb_id` = home page.
   */
  mapsToHome?: boolean;
  /** Components from Moodle section &lt;summary&gt; (prepended on the CB home page). */
  homeSummaryComponents?: MappedComponent[];
}

/** Sentinel `sectionTempKey` for pages that map onto the CB course home page. */
export const MBZ_HOME_SECTION_TEMP = "__course_home__";

/** Moodle section 0 / General / "עמוד ראשי" → CB built-in home page. */
export function isMoodleHomeSection(section: MbzSection): boolean {
  if (section.number === 0) return true;
  const name = section.name.trim();
  if (!name) return false;
  if (/^עמוד\s*ראשי$/u.test(name)) return true;
  if (/^(general|כללי)$/iu.test(name)) return true;
  return false;
}

/** Moodle activity titled like the course home page. */
export function isMoodleHomeActivityName(name: string): boolean {
  return /^עמוד\s*ראשי$/u.test(name.trim());
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
  /** filename ↔ Moodle pluginfile https map for preview + export remap. */
  pluginfileMap: PluginfileUrlMap;
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
  editableBySection: Map<string, string[]>,
  /** When true, also map unilabel / learningmap / lti onto the CB home page. */
  mapHomeExtras: boolean
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
        editableBySection,
        mapHomeExtras
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
      continue;
    }

    // Home extras: unilabel buttons, learningmap image, LTI button — still preserved in sequence
    if (mapHomeExtras) {
      const extras = mapHomeExtraActivity(vfs, activity);
      if (extras && extras.length > 0) {
        pages.push({
          tempKey: crypto.randomUUID(),
          sectionTempKey: cbSectionTempKey,
          title: activity.name || activity.type,
          position: positionStart.n++,
          components: extras.map((c, i) => ({ ...c, position: i })),
          isCourseHome: true,
          oneWayHomeExtra: true,
          binding: {
            moodleId: activity.cmid,
            modtype: activity.type,
            activityDir: activity.activityDir,
            payloadField: null,
            meta: {
              originalName: activity.name,
              parentSectionMoodleId: owningMoodleSection.id,
              mapsToHome: true,
            },
          },
        });
      }
    }

    pushPreserved(owningMoodleSection.id, activity.cmid);
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
    const mapsToHome = isMoodleHomeSection(section);
    const sectionTempKey = mapsToHome ? MBZ_HOME_SECTION_TEMP : crypto.randomUUID();
    const positionStart = { n: 0 };
    const pagesBefore = pages.length;
    const nodes = buildActivityNodes(manifest, section);
    moodleSectionsNeeded.add(section.id);

    // Banner + intro often live in the section summary, not in activities
    const homeSummaryComponents = mapsToHome ? mapHomeSectionSummary(section) : [];
    if (homeSummaryComponents.length > 0) {
      pages.push({
        tempKey: crypto.randomUUID(),
        sectionTempKey: MBZ_HOME_SECTION_TEMP,
        title: "עמוד ראשי",
        position: positionStart.n++,
        components: homeSummaryComponents,
        isCourseHome: true,
        fromSectionSummary: true,
        binding: {
          moodleId: section.id,
          modtype: "section_summary",
          activityDir: null,
          payloadField: "summary",
          meta: {
            originalName: section.name || "עמוד ראשי",
            parentSectionMoodleId: section.id,
            mapsToHome: true,
          },
        },
      });
    }

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
      editableBySection,
      mapsToHome
    );

    // Promote pages from a home Moodle section (or named עמוד ראשי) onto CB home
    for (let i = pagesBefore; i < pages.length; i += 1) {
      const page = pages[i]!;
      if (mapsToHome || isMoodleHomeActivityName(page.title) || page.oneWayHomeExtra) {
        page.isCourseHome = true;
        page.sectionTempKey = MBZ_HOME_SECTION_TEMP;
        page.binding.meta.mapsToHome = true;
      }
    }

    // Also bind any delegated sections referenced under this tree
    for (const node of nodes) {
      if (node.kind === "subsection" && node.delegatedSectionId) {
        moodleSectionsNeeded.add(node.delegatedSectionId);
      }
    }

    if (mapsToHome) {
      sections.push({
        tempKey: MBZ_HOME_SECTION_TEMP,
        title: section.name || "עמוד ראשי",
        position: -1,
        moodleId: section.id,
        mapsToHome: true,
        homeSummaryComponents,
        meta: {
          originalSequence: [...section.activityRefs],
          preservedCmids: [...new Set(preservedBySection.get(section.id) ?? [])],
          sectionNumber: section.number,
          mapsToHome: true,
        },
      });
      continue;
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

  // Activity titled עמוד ראשי under a normal lesson → still land on CB home
  for (const page of pages) {
    if (page.isCourseHome) continue;
    if (!isMoodleHomeActivityName(page.title)) continue;
    page.isCourseHome = true;
    page.sectionTempKey = MBZ_HOME_SECTION_TEMP;
    page.binding.meta.mapsToHome = true;
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

  // Resolve @@PLUGINFILE@@ → live Moodle pluginfile.php URLs for CB preview (no binaries stored)
  const pluginfileMap = buildPluginfileUrlMap(manifest);
  for (const page of pages) {
    page.components = resolveComponentMediaUrls(
      page.components.map((c) => ({
        type: c.type,
        position: c.position,
        props: c.props as Record<string, unknown>,
      })),
      pluginfileMap
    ).map((c, i) => ({
      type: c.type as MappedComponent["type"],
      position: i,
      props: c.props as MappedComponent["props"],
    }));
  }
  if (!pluginfileMap.wwwroot) {
    warnings.push(
      "לא נמצא original_wwwroot בגיבוי — תמונות @@PLUGINFILE@@ לא יוצגו כקישורי Moodle."
    );
  } else if (Object.keys(pluginfileMap.byFilename).length === 0) {
    warnings.push(
      "לא ניתן לבנות קישורי pluginfile לקבצים (חסרים contextid/component ב-files.xml)."
    );
  }

  return {
    courseTitle: manifest.course.fullname || "קורס מיובא",
    courseDescription: manifest.course.shortname || null,
    moodleVersion: manifest.course.moodleVersion,
    sections,
    pages,
    editableCmids,
    warnings,
    pluginfileMap,
  };
}
