import { vfsGet, vfsListPrefix, vfsText } from "./extract";
import type { MbzActivity, MbzFileRef, MbzManifest, MbzSection, MbzVfs } from "./types";
import { asArray, moodleNull, textOf, xmlParser } from "./xml";

function parseFilesXml(vfs: MbzVfs): MbzFileRef[] {
  const raw = vfsText(vfs, "files.xml");
  if (!raw) return [];
  const doc = xmlParser.parse(raw);
  const files = asArray(doc?.files?.file ?? doc?.file);
  const refs: MbzFileRef[] = [];
  for (const f of files) {
    const hash = textOf(f.contenthash ?? f.hash).trim();
    const originalFilename = textOf(f.filename).trim();
    const mimetype = textOf(f.mimetype) || "application/octet-stream";
    if (!hash || !originalFilename || originalFilename === ".") continue;
    const prefix = hash.slice(0, 2);
    refs.push({
      hash,
      originalFilename,
      mimetype,
      bucketPath: `files/${prefix}/${hash}`,
    });
  }
  return refs;
}

function findBackupXml(vfs: MbzVfs): string | null {
  return vfsText(vfs, "moodle_backup.xml");
}

export function buildManifest(
  vfs: MbzVfs,
  sourceMeta: { name: string; sha1: string; sizeBytes: number }
): MbzManifest {
  const warnings: string[] = [];
  const backupRaw = findBackupXml(vfs);
  if (!backupRaw) {
    throw new Error("moodle_backup.xml not found in archive");
  }

  const backup = xmlParser.parse(backupRaw);
  const info = backup?.moodle_backup?.information ?? backup?.information ?? {};
  const detail = info.details ?? info;
  const fullname = textOf(detail.original_course_fullname || detail.fullname) || "Untitled course";
  const shortname = textOf(detail.original_course_shortname || detail.shortname) || "";
  const format = textOf(detail.original_course_format || detail.format) || "";
  const moodleVersion =
    textOf(detail.moodle_release || detail.moodle_version || info.moodle_release) || "";

  const settingsNodes = asArray(
    info.settings?.setting ?? backup?.moodle_backup?.information?.settings?.setting
  );
  let includesUsers = false;
  let anonymized = false;
  for (const s of settingsNodes) {
    const name = textOf(s.name);
    const value = textOf(s.value);
    if (name === "users" && (value === "1" || value === "true")) includesUsers = true;
    if (name === "anonymize" && (value === "1" || value === "true")) anonymized = true;
  }

  // Activity index from moodle_backup.xml (names)
  const backupActivities = asArray(
    info.contents?.activities?.activity ??
      backup?.moodle_backup?.information?.contents?.activities?.activity
  );
  const nameByCmid = new Map<string, { type: string; name: string }>();
  for (const a of backupActivities) {
    const moduleid = textOf(a.moduleid || a.cmid);
    const modulename = textOf(a.modulename || a.module);
    const title = textOf(a.title || a.name);
    if (moduleid) nameByCmid.set(moduleid, { type: modulename, name: title });
  }

  // Sections from disk
  const sectionPaths = vfsListPrefix(vfs, "sections").filter((p) =>
    /sections\/section_\d+\/section\.xml$/i.test(p)
  );
  const sections: MbzSection[] = [];
  const sectionMeta = new Map<
    string,
    { component: string | null; itemid: string | null }
  >();

  for (const path of sectionPaths) {
    const xml = vfsText(vfs, path);
    if (!xml) continue;
    const doc = xmlParser.parse(xml);
    // Root <section> must be a single object (not an array)
    let sec = doc?.section ?? doc;
    if (Array.isArray(sec)) sec = sec[0] ?? {};
    const id =
      textOf(sec["@_id"]) ||
      path.match(/section_(\d+)/)?.[1] ||
      "";
    const number = parseInt(textOf(sec.number), 10);
    const parsedNumber = Number.isFinite(number) ? number : 0;
    const name = textOf(sec.name) || `Section ${parsedNumber}`;
    const summaryRaw = textOf(sec.summary) || null;
    const sequence = textOf(sec.sequence)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const component = moodleNull(textOf(sec.component));
    const itemid = moodleNull(textOf(sec.itemid));
    sectionMeta.set(id, { component, itemid });
    sections.push({
      id,
      number: parsedNumber,
      name,
      summaryHtml: null,
      summaryStatus: "pending",
      summaryRaw,
      activityRefs: sequence,
      delegatedBy: null,
    });
  }
  sections.sort((a, b) => a.number - b.number);

  // Activities from folder names
  const activityDirs = new Set<string>();
  for (const key of vfs.keys()) {
    const m = key.match(/^activities\/([a-z0-9]+)_(\d+)\//i);
    if (m) activityDirs.add(`activities/${m[1]}_${m[2]}`);
  }

  const activities: MbzActivity[] = [];
  for (const dir of activityDirs) {
    const m = dir.match(/^activities\/([a-z0-9]+)_(\d+)$/i);
    if (!m) continue;
    const type = m[1].toLowerCase();
    const cmid = m[2];
    const rawXmlPath = `${dir}/${type}.xml`;
    const hasGrading = vfsGet(vfs, `${dir}/grading.xml`) != null;
    const fromBackup = nameByCmid.get(cmid);

    // Prefer title from module.xml / payload if backup missing
    let name = fromBackup?.name || `${type} ${cmid}`;
    const moduleXml = vfsText(vfs, `${dir}/module.xml`);
    if (moduleXml) {
      try {
        const modDoc = xmlParser.parse(moduleXml);
        const modName = textOf(modDoc?.module?.name || modDoc?.name);
        if (modName) name = modName;
      } catch {
        /* ignore */
      }
    }
    // Payload often has <name>
    const payload = vfsText(vfs, rawXmlPath);
    if (payload) {
      try {
        const pDoc = xmlParser.parse(payload);
        const root = pDoc?.[type] ?? pDoc?.activity?.[type] ?? pDoc;
        const payloadName = textOf(root?.name ?? root?.title);
        if (payloadName) name = payloadName;
      } catch {
        /* ignore */
      }
    }

    activities.push({
      cmid,
      type,
      name,
      hasGrading,
      contentStatus: "pending",
      content: null,
      rawXmlPath,
      activityDir: dir,
    });
  }

  // Subsection delegation: section.component === mod_subsection, itemid matches subsection activity's internal id
  // Moodle stores subsection module instance id in itemid; find subsection_* whose payload <id> or module id matches
  for (const section of sections) {
    const meta = sectionMeta.get(section.id);
    if (!meta || meta.component !== "mod_subsection" || !meta.itemid) continue;

    for (const act of activities) {
      if (act.type !== "subsection") continue;
      const payload = vfsText(vfs, act.rawXmlPath);
      if (!payload) continue;
      try {
        const pDoc = xmlParser.parse(payload);
        const root = pDoc?.subsection ?? pDoc?.activity?.subsection ?? pDoc;
        const instanceId = textOf(root?.["@_id"] ?? root?.id);
        // Also check module.xml id
        const moduleXml = vfsText(vfs, `${act.activityDir}/module.xml`);
        let moduleInstanceId = "";
        if (moduleXml) {
          const mDoc = xmlParser.parse(moduleXml);
          moduleInstanceId = textOf(mDoc?.module?.["@_id"] ?? mDoc?.module?.id);
        }
        if (instanceId === meta.itemid || moduleInstanceId === meta.itemid || act.cmid === meta.itemid) {
          section.delegatedBy = act.cmid;
          break;
        }
      } catch {
        /* ignore */
      }
    }
    if (!section.delegatedBy) {
      warnings.push(
        `Could not resolve subsection delegation for section ${section.id} (itemid=${meta.itemid})`
      );
    }
  }

  const files = parseFilesXml(vfs);
  if (files.length === 0) {
    warnings.push("No files indexed from files.xml (missing or empty)");
  }

  return {
    sourceFile: sourceMeta,
    course: {
      fullname,
      shortname,
      format,
      moodleVersion,
      backupSettings: { includesUsers, anonymized },
    },
    sections,
    activities,
    files,
    warnings,
  };
}
