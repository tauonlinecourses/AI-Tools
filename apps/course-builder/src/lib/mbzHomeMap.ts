/**
 * Map Moodle home-section content that is not a normal page/label:
 * - section <summary> HTML (banner + intro text)
 * - unilabel grid tiles → buttons
 * - learningmap background image → interactive_unit thumbnail
 * - lti → button when a URL is present
 */

import { unescapeXmlEntities, vfsText, type MbzActivity, type MbzSection, type MbzVfs } from "@workspace/mbz-parser";
import { splitMoodleHtmlToComponents, type MappedComponent } from "./mbzHtmlSplit";

function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return null;
  const body = m[1]!.trim();
  if (!body || body === "$@NULL@$") return null;
  return unescapeXmlEntities(body);
}

/** Raw section summary HTML (keeps @@PLUGINFILE@@), not the decoded mbz-blob version. */
export function homeSectionSummaryHtml(section: MbzSection): string {
  if (!section.summaryRaw?.trim()) return "";
  return unescapeXmlEntities(section.summaryRaw).trim();
}

export function mapHomeSectionSummary(section: MbzSection): MappedComponent[] {
  const html = homeSectionSummaryHtml(section);
  if (!html || /^<p>(\s|&nbsp;|<br\s*\/?>)*<\/p>$/i.test(html)) return [];
  return splitMoodleHtmlToComponents(html);
}

/** unilabel grid / carousel tiles → CB buttons. */
export function mapUnilabelToComponents(vfs: MbzVfs, activity: MbzActivity): MappedComponent[] {
  const xml = vfsText(vfs, activity.rawXmlPath);
  if (!xml) return [];

  const tiles = [
    ...xml.matchAll(
      /<unilabeltype_grid_tile\b[^>]*>([\s\S]*?)<\/unilabeltype_grid_tile>/gi
    ),
  ];
  const carousel = [
    ...xml.matchAll(
      /<unilabeltype_carousel_slide\b[^>]*>([\s\S]*?)<\/unilabeltype_carousel_slide>/gi
    ),
  ];
  const blocks = tiles.length > 0 ? tiles : carousel;
  const out: MappedComponent[] = [];

  for (const block of blocks) {
    const body = block[1] ?? "";
    const title =
      extractTag(body, "title")?.trim() ||
      extractTag(body, "urltitle")?.trim() ||
      "כפתור";
    const url = (extractTag(body, "url") ?? "").trim();
    out.push({
      type: "button",
      position: out.length,
      props: { text: title, url, align: "center" },
    });
  }

  // Fallback: intro HTML if no tiles
  if (out.length === 0) {
    const intro = extractTag(xml, "intro");
    if (intro?.trim()) return splitMoodleHtmlToComponents(intro);
  }
  return out;
}

/** learningmap → interactive_unit using the SVG background @@PLUGINFILE@@ image. */
export function mapLearningmapToComponents(vfs: MbzVfs, activity: MbzActivity): MappedComponent[] {
  const xml = vfsText(vfs, activity.rawXmlPath);
  if (!xml) return [];

  const svgcode = extractTag(xml, "svgcode") ?? "";
  const plugin =
    svgcode.match(/@@PLUGINFILE@@\/[^"'\\\s>]+/i)?.[0] ??
    svgcode.match(/@@PLUGINFILE@@\/[^"]+/i)?.[0] ??
    "";
  const imageUrl = plugin
    ? (() => {
        try {
          const rest = plugin.slice("@@PLUGINFILE@@/".length).split("?")[0] ?? "";
          return `@@PLUGINFILE@@/${decodeURIComponent(rest.replace(/\+/g, " "))}`;
        } catch {
          return plugin.split("?")[0] ?? plugin;
        }
      })()
    : "";

  return [
    {
      type: "interactive_unit",
      position: 0,
      props: {
        imageUrl,
        fileUrl: "",
      },
    },
  ];
}

/** LTI tool → button when an external URL is present. */
export function mapLtiToComponents(vfs: MbzVfs, activity: MbzActivity): MappedComponent[] {
  const xml = vfsText(vfs, activity.rawXmlPath);
  if (!xml) return [];
  const url =
    extractTag(xml, "toolurl") ||
    extractTag(xml, "securetoolurl") ||
    extractTag(xml, "launchcontainer") ||
    "";
  // Many LTIs only have a toolid — still show a labeled button without URL
  return [
    {
      type: "button",
      position: 0,
      props: {
        text: activity.name || "LTI",
        url: url && /^https?:\/\//i.test(url) ? url : "",
        align: "center",
      },
    },
  ];
}

/** Map a home-section unsupported activity into CB components, or null if unknown. */
export function mapHomeExtraActivity(
  vfs: MbzVfs,
  activity: MbzActivity
): MappedComponent[] | null {
  switch (activity.type) {
    case "unilabel":
      return mapUnilabelToComponents(vfs, activity);
    case "learningmap":
      return mapLearningmapToComponents(vfs, activity);
    case "lti":
      return mapLtiToComponents(vfs, activity);
    default:
      return null;
  }
}
