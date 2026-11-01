/**
 * Preserve-and-patch MBZ export from a Course Builder course that was imported from MBZ.
 */

import {
  encodeVfsText,
  extract,
  sha1Hex,
  patchActivityXmlField,
  patchSectionName,
  patchSectionSequence,
  rebuildSequence,
  vfsGet,
  vfsText,
  vfsToMbz,
} from "@workspace/mbz-parser";
import { getCourseTree, listComponents } from "./api";
import {
  downloadMbzArchive,
  getCourseMbzSource,
  listCourseMbzBindings,
} from "./mbzStorage";
import type { ActivityBindingMeta, CourseMbzSource, SectionBindingMeta } from "./mbzTypes";
import { isHomePage, type BlockProps, type Page, type PageComponent } from "./types";

function fail(message: string): never {
  throw new Error(message);
}

function sanitizeFilename(title: string): string {
  const cleaned = title
    .trim()
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return cleaned || "course";
}

function formatDateForFilename(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function downloadBytes(bytes: Uint8Array, filename: string): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function textHtmlFromComponents(components: PageComponent[]): string {
  const text = components.find((c) => c.type === "text");
  const props = (text?.props ?? {}) as BlockProps;
  return props.html ?? props.markdown ?? "";
}

function buttonUrlFromComponents(components: PageComponent[]): string {
  const btn = components.find((c) => c.type === "button");
  const props = (btn?.props ?? {}) as BlockProps;
  return props.url?.trim() ?? "";
}

function patchModuleName(xml: string, name: string): string {
  const patched = xml.replace(
    /(<name(?:\s[^>]*)?>)([\s\S]*?)(<\/name>)/i,
    (_m, open: string, _body: string, close: string) => {
      const escaped = name
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
      return `${open}${escaped}${close}`;
    }
  );
  return patched;
}

export interface ExportMbzResult {
  skippedCbOnlyPages: number;
  warnings: string[];
}

function needsOriginalFile(source: CourseMbzSource): boolean {
  const backend = source.storage_backend ?? "reupload";
  return (
    backend === "reupload" ||
    source.storage_path === "reupload" ||
    source.storage_path.startsWith("reupload")
  );
}

/** Open a file picker for the original .mbz used at import time. */
export function pickOriginalMbzFile(preferredName?: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".mbz,.zip,.tgz,application/zip,application/x-gzip";
    input.style.display = "none";
    const cleanup = () => {
      input.remove();
    };
    input.addEventListener("change", () => {
      const file = input.files?.[0] ?? null;
      cleanup();
      resolve(file);
    });
    // Cancel is not reliably detectable in all browsers; resolve null on window focus after delay.
    const onFocus = () => {
      window.removeEventListener("focus", onFocus);
      window.setTimeout(() => {
        if (!input.files?.length) {
          cleanup();
          resolve(null);
        }
      }, 400);
    };
    window.addEventListener("focus", onFocus);
    document.body.appendChild(input);
    if (preferredName) {
      input.title = preferredName;
    }
    input.click();
  });
}

async function loadOriginalArchiveBuffer(
  source: CourseMbzSource,
  originalFile?: File | null
): Promise<ArrayBuffer> {
  if (needsOriginalFile(source)) {
    if (!originalFile) {
      fail(
        `בחרו את קובץ ה-MBZ המקורי${source.source_filename ? ` (${source.source_filename})` : ""} כדי לייצא`
      );
    }
    const buffer = await originalFile.arrayBuffer();
    const sha1 = await sha1Hex(buffer);
    if (sha1 !== source.source_sha1) {
      fail(
        `הקובץ שנבחר אינו תואם לייבוא המקורי` +
          (source.source_filename ? ` (${source.source_filename})` : "") +
          `. בחרו את אותו קובץ MBZ ששימש בייבוא.`
      );
    }
    return buffer;
  }
  return downloadMbzArchive(source);
}

/**
 * Patch original MBZ from current CB state and download.
 * For `reupload` sources (default), pass the original File from a picker.
 */
export async function exportCourseMbz(
  courseId: string,
  originalFile?: File | null
): Promise<ExportMbzResult> {
  const source = await getCourseMbzSource(courseId);
  if (!source) {
    fail("לקורס זה אין מקור MBZ — ייצוא MBZ זמין רק לקורסים שיובאו מקובץ MBZ");
  }

  const bindings = await listCourseMbzBindings(courseId);
  const tree = await getCourseTree(courseId);
  const warnings: string[] = [];

  const sectionBindings = bindings.filter((b) => b.entity_kind === "section");
  const activityBindings = bindings.filter((b) => b.entity_kind === "activity" && b.editable);

  const pageById = new Map(tree.pages.map((p) => [p.id, p]));
  const boundPageIds = new Set(activityBindings.map((b) => b.cb_id));

  const lessonPages = tree.pages.filter((p) => !isHomePage(p));
  const skippedCbOnlyPages = lessonPages.filter((p) => !boundPageIds.has(p.id)).length;
  if (skippedCbOnlyPages > 0) {
    warnings.push(
      `${skippedCbOnlyPages} עמודים שנוספו ב-Course Builder לא יוצאו ל-MBZ (אין פעילות Moodle תואמת)`
    );
  }

  const buffer = await loadOriginalArchiveBuffer(source, originalFile);
  const { vfs } = await extract(buffer);

  // Patch section titles for editable (non-bindingOnly) section bindings
  for (const binding of sectionBindings) {
    const meta = binding.meta as unknown as SectionBindingMeta & { bindingOnly?: boolean };
    if (meta.bindingOnly) continue;
    const cbSection = tree.sections.find((s) => s.id === binding.cb_id);
    if (!cbSection) continue;
    const sectionPath = `sections/section_${binding.moodle_id}/section.xml`;
    const xml = vfsText(vfs, sectionPath);
    if (!xml) {
      warnings.push(`חסר section.xml עבור ${binding.moodle_id}`);
      continue;
    }
    let next = patchSectionName(xml, cbSection.title);
    vfs.set(sectionPath, encodeVfsText(next));
  }

  // Patch activities
  const componentsByPage = new Map<string, PageComponent[]>();
  for (const binding of activityBindings) {
    const page = pageById.get(binding.cb_id);
    if (!page) continue; // deleted — soft-omit later
    let comps = componentsByPage.get(page.id);
    if (!comps) {
      comps = await listComponents(page.id);
      componentsByPage.set(page.id, comps);
    }

    const dir = binding.activity_dir;
    if (!dir) continue;
    const payloadPath = `${dir}/${binding.modtype}.xml`;
    const modulePath = `${dir}/module.xml`;
    const payloadXml = vfsText(vfs, payloadPath);
    if (!payloadXml) {
      warnings.push(`חסר XML לפעילות ${binding.moodle_id}`);
      continue;
    }

    const modtype = binding.modtype ?? "";
    let nextXml = payloadXml;

    // H5P / board: keep original payload (CB mapping is one-way for content); still sync names.
    if (modtype === "hvp") {
      try {
        nextXml = patchModuleName(nextXml, page.title);
      } catch {
        /* ignore */
      }
      vfs.set(payloadPath, encodeVfsText(nextXml));
      const moduleXml = vfsText(vfs, modulePath);
      if (moduleXml) {
        vfs.set(modulePath, encodeVfsText(patchModuleName(moduleXml, page.title)));
      }
      continue;
    }

    if (modtype === "board") {
      const html = textHtmlFromComponents(comps);
      try {
        nextXml = patchActivityXmlField(nextXml, binding.payload_field || "intro", html);
      } catch {
        /* keep original intro */
      }
      try {
        nextXml = patchModuleName(nextXml, page.title);
      } catch {
        /* ignore */
      }
      vfs.set(payloadPath, encodeVfsText(nextXml));
      const moduleXml = vfsText(vfs, modulePath);
      if (moduleXml) {
        vfs.set(modulePath, encodeVfsText(patchModuleName(moduleXml, page.title)));
      }
      continue;
    }

    if (modtype === "url") {
      const url = buttonUrlFromComponents(comps);
      if (binding.payload_field === "externalurl" || binding.payload_field == null) {
        nextXml = patchActivityXmlField(nextXml, "externalurl", url);
      }
      const meta = binding.meta as unknown as ActivityBindingMeta;
      const introComp = textHtmlFromComponents(comps);
      if (introComp || meta.introHtml != null) {
        try {
          nextXml = patchActivityXmlField(nextXml, "intro", introComp);
        } catch {
          /* intro optional */
        }
      }
    } else if (modtype === "resource") {
      const field = binding.payload_field || "intro";
      const html = textHtmlFromComponents(comps);
      nextXml = patchActivityXmlField(nextXml, field, html);
    } else {
      const field = binding.payload_field || (modtype === "label" ? "intro" : "content");
      const html = textHtmlFromComponents(comps);
      nextXml = patchActivityXmlField(nextXml, field, html);
    }

    // Sync activity name from page title
    try {
      nextXml = patchModuleName(nextXml, page.title);
    } catch {
      /* ignore */
    }
    vfs.set(payloadPath, encodeVfsText(nextXml));

    const moduleXml = vfsText(vfs, modulePath);
    if (moduleXml) {
      vfs.set(modulePath, encodeVfsText(patchModuleName(moduleXml, page.title)));
    }
  }

  // Rebuild sequences per Moodle section binding
  for (const binding of sectionBindings) {
    const meta = binding.meta as unknown as SectionBindingMeta & { bindingOnly?: boolean };
    const originalSequence = meta.originalSequence ?? [];
    const sectionPath = `sections/section_${binding.moodle_id}/section.xml`;
    const xml = vfsGet(vfs, sectionPath) ? vfsText(vfs, sectionPath) : null;
    if (!xml) continue;

    // Editable activities whose parentSectionMoodleId matches this moodle section
    const sectionActivityBindings = activityBindings.filter((b) => {
      const m = b.meta as unknown as ActivityBindingMeta;
      return m.parentSectionMoodleId === binding.moodle_id;
    });
    const editableCmidSet = new Set(sectionActivityBindings.map((b) => b.moodle_id));

    // Order by current CB page position among pages that still exist
    const alive = sectionActivityBindings
      .map((b) => ({ binding: b, page: pageById.get(b.cb_id) }))
      .filter((x): x is { binding: (typeof sectionActivityBindings)[0]; page: Page } => !!x.page)
      .sort((a, b) => a.page.position - b.page.position);

    const orderedEditableCmids = alive.map((x) => x.binding.moodle_id);
    const removedEditableCmids = sectionActivityBindings
      .filter((b) => !pageById.has(b.cb_id))
      .map((b) => b.moodle_id);

    const nextSeq = rebuildSequence({
      orderedEditableCmids,
      originalSequence,
      removedEditableCmids,
      editableCmidSet,
    });

    const nextXml = patchSectionSequence(xml, nextSeq);
    vfs.set(sectionPath, encodeVfsText(nextXml));
  }

  const bytes = vfsToMbz(vfs, { format: source.archive_kind });
  const filename = `${sanitizeFilename(tree.course.title)}-${formatDateForFilename(new Date())}.mbz`;
  downloadBytes(bytes, filename);

  return { skippedCbOnlyPages, warnings };
}
