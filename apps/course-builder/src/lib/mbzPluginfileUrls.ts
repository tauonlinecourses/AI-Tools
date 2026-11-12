/**
 * Resolve @@PLUGINFILE@@ tokens to live Moodle pluginfile.php URLs for CB preview.
 * No binary storage — display only. Export remaps known URLs back to tokens.
 */

import {
  buildMoodlePluginfileUrl,
  type MbzFileRef,
  type MbzManifest,
} from "@workspace/mbz-parser";

const PLUGINFILE_PREFIX_RE = /^@@PLUGINFILE@@\//i;

/** Moodle id used for the course-level pluginfile URL map binding. */
export const MBZ_PLUGINFILE_MAP_MOODLE_ID = "__pluginfile_map__";

export type PluginfileUrlMap = {
  /** originalFilename → Moodle https pluginfile URL */
  byFilename: Record<string, string>;
  /** Moodle https URL → originalFilename (for export remap) */
  byUrl: Record<string, string>;
  wwwroot: string | null;
};

function normalizeFilename(raw: string): string {
  let name = raw.trim();
  // Strip query/hash from token path
  name = name.split("?")[0]?.split("#")[0] ?? name;
  try {
    name = decodeURIComponent(name.replace(/\+/g, " "));
  } catch {
    /* keep */
  }
  return name;
}

/**
 * Moodle backups list the same filename many times (user/draft + mod_page/content).
 * Draft pluginfile URLs 404 for other sessions — CTA thumbs (Frame / תמליל / הפניה)
 * often hit draft first while unique banners already live under content.
 * Higher score wins.
 */
export function pluginfileRefScore(ref: MbzFileRef): number {
  const component = (ref.component ?? "").trim().toLowerCase();
  const filearea = (ref.filearea ?? "").trim().toLowerCase();
  if (!component || !filearea) return -1;
  if (filearea === "draft" || component === "user") return 0;
  if (component === "backup" || filearea.includes("backup")) return 1;
  if (filearea === "content" || filearea === "intro" || filearea === "section") {
    return component.startsWith("mod_") || component === "course" ? 20 : 15;
  }
  if (component.startsWith("mod_")) return 12;
  if (component === "course") return 10;
  return 5;
}

/** Basename keys + optional `dir/file` key when filepath is not `/`. */
function filenameKeysForRef(ref: MbzFileRef): string[] {
  const name = normalizeFilename(ref.originalFilename);
  if (!name) return [];
  const keys = [name];
  let fp = (ref.filepath ?? "/").trim() || "/";
  if (!fp.startsWith("/")) fp = `/${fp}`;
  if (!fp.endsWith("/")) fp = `${fp}/`;
  if (fp !== "/") {
    const rel = `${fp.slice(1)}${name}`; // e.g. folder/file.png
    if (rel && rel !== name) keys.push(normalizeFilename(rel));
  }
  try {
    for (const k of [...keys]) {
      const encoded = encodeURIComponent(k);
      if (encoded !== k) keys.push(encoded);
    }
  } catch {
    /* ignore */
  }
  return keys;
}

function basenameFromUrlPath(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    return last ? normalizeFilename(last) : null;
  } catch {
    const bare = url.split("?")[0]?.split("#")[0] ?? url;
    const last = bare.split("/").filter(Boolean).pop();
    return last ? normalizeFilename(last) : null;
  }
}

/**
 * Prefer stable content/intro/section refs over user/draft when filenames collide.
 */
export function buildPluginfileUrlMap(manifest: MbzManifest): PluginfileUrlMap {
  const wwwroot = manifest.course.wwwroot ?? null;
  const byFilename: Record<string, string> = {};
  const byUrl: Record<string, string> = {};
  const scoreByKey: Record<string, number> = {};

  for (const ref of manifest.files) {
    const score = pluginfileRefScore(ref);
    if (score < 0) continue;
    const url = buildMoodlePluginfileUrl(wwwroot, ref);
    if (!url) continue;
    const keys = filenameKeysForRef(ref);
    if (keys.length === 0) continue;

    const primary = keys[0]!;
    let improved = false;
    for (const key of keys) {
      const prev = scoreByKey[key];
      if (prev != null && prev >= score) continue;
      byFilename[key] = url;
      scoreByKey[key] = score;
      improved = true;
    }
    if (improved) {
      byUrl[url] = primary;
    }
  }

  return { byFilename, byUrl, wwwroot };
}

export function isPluginfileToken(url: string | null | undefined): boolean {
  return !!url && PLUGINFILE_PREFIX_RE.test(url.trim());
}

/** @@PLUGINFILE@@/name → https pluginfile URL, or null if unknown. */
export function resolvePluginfileToken(
  tokenOrUrl: string | null | undefined,
  map: PluginfileUrlMap
): string | null {
  if (!tokenOrUrl) return null;
  const raw = tokenOrUrl.trim();
  if (!PLUGINFILE_PREFIX_RE.test(raw)) return null;
  const rest = raw.replace(PLUGINFILE_PREFIX_RE, "");
  const name = normalizeFilename(rest);
  return map.byFilename[name] ?? map.byFilename[rest] ?? null;
}

/** Rewrite a single media URL for CB display. */
export function resolveMediaUrlForDisplay(
  url: string | null | undefined,
  map: PluginfileUrlMap
): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("blob:")) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    // Live Moodle HTML often still points at draftfile.php (expires / user-scoped).
    // Swap to the stable pluginfile URL when files.xml knows that filename.
    if (/\/draftfile\.php\//i.test(trimmed)) {
      const name = basenameFromUrlPath(trimmed);
      const mapped = name
        ? map.byFilename[name] ?? map.byFilename[encodeURIComponent(name)]
        : null;
      if (mapped) return mapped;
    }
    return trimmed;
  }
  const resolved = resolvePluginfileToken(trimmed, map);
  return resolved ?? trimmed;
}

/** Rewrite img/src (and optional background) PLUGINFILE tokens inside HTML. */
export function resolvePluginfileHtml(
  html: string | null | undefined,
  map: PluginfileUrlMap
): string {
  if (!html) return "";
  return html.replace(
    /(src|href)=(["'])@@PLUGINFILE@@\/([^"']+)\2/gi,
    (_m, attr: string, quote: string, encoded: string) => {
      const resolved = resolvePluginfileToken(`@@PLUGINFILE@@/${encoded}`, map);
      if (!resolved) return `${attr}=${quote}@@PLUGINFILE@@/${encoded}${quote}`;
      return `${attr}=${quote}${resolved}${quote}`;
    }
  );
}

/**
 * On export: turn known Moodle pluginfile https URLs back into @@PLUGINFILE@@/filename.
 * Unknown / user-overridden URLs stay as-is.
 */
export function remapUrlToPluginfileToken(
  url: string | null | undefined,
  map: PluginfileUrlMap | null | undefined
): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed || !map) return trimmed;
  const filename = map.byUrl[trimmed];
  if (filename) return `@@PLUGINFILE@@/${filename}`;
  // Also match if query/hash differs slightly
  const bare = trimmed.split("?")[0]?.split("#")[0] ?? trimmed;
  const byBare = map.byUrl[bare];
  if (byBare) return `@@PLUGINFILE@@/${byBare}`;
  return trimmed;
}

/** Remap known Moodle pluginfile URLs inside HTML back to @@PLUGINFILE@@ tokens. */
export function remapHtmlPluginfileUrls(
  html: string | null | undefined,
  map: PluginfileUrlMap | null | undefined
): string {
  if (!html) return "";
  if (!map || Object.keys(map.byUrl).length === 0) return html;
  return html.replace(
    /(src|href)=(["'])(https?:\/\/[^"']+)\2/gi,
    (_m, attr: string, quote: string, href: string) => {
      const token = remapUrlToPluginfileToken(href, map);
      return `${attr}=${quote}${token}${quote}`;
    }
  );
}

/** Apply display resolution to CB component props after HTML split. */
export function resolveComponentMediaUrls<
  T extends { type: string; props: Record<string, unknown> },
>(components: T[], map: PluginfileUrlMap): T[] {
  return components.map((c) => {
    const props = { ...c.props };
    if (typeof props.imageUrl === "string") {
      props.imageUrl = resolveMediaUrlForDisplay(props.imageUrl, map);
    }
    if (typeof props.fileUrl === "string" && isPluginfileToken(props.fileUrl)) {
      props.fileUrl = resolveMediaUrlForDisplay(props.fileUrl, map);
    }
    if (typeof props.html === "string") {
      props.html = resolvePluginfileHtml(props.html, map);
    }
    if (typeof props.url === "string" && isPluginfileToken(props.url)) {
      props.url = resolveMediaUrlForDisplay(props.url, map);
    }
    return { ...c, props };
  });
}

/** Serialize map for binding meta (compact). */
export function pluginfileMapToMeta(map: PluginfileUrlMap): Record<string, unknown> {
  return {
    pluginfileByFilename: map.byFilename,
    pluginfileByUrl: map.byUrl,
    pluginfileWwwroot: map.wwwroot,
  };
}

/** Restore map from a binding meta blob. */
export function pluginfileMapFromMeta(
  meta: Record<string, unknown> | null | undefined
): PluginfileUrlMap | null {
  if (!meta) return null;
  const byFilename = meta.pluginfileByFilename;
  const byUrl = meta.pluginfileByUrl;
  if (!byFilename || typeof byFilename !== "object") return null;
  return {
    byFilename: byFilename as Record<string, string>,
    byUrl:
      byUrl && typeof byUrl === "object"
        ? (byUrl as Record<string, string>)
        : Object.fromEntries(
            Object.entries(byFilename as Record<string, string>).map(([k, v]) => [v, k])
          ),
    wwwroot: typeof meta.pluginfileWwwroot === "string" ? meta.pluginfileWwwroot : null,
  };
}

/** Prefer a file ref that can build a URL (for tests / callers). */
export function pickResolvableFile(
  files: MbzFileRef[],
  filename: string
): MbzFileRef | undefined {
  const want = normalizeFilename(filename);
  return files.find((f) => normalizeFilename(f.originalFilename) === want);
}
