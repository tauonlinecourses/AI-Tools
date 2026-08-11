import { vfsText } from "../extract";
import { decodeHtmlField, type ResolveBlobUrl } from "../resolvePluginfiles";
import type { MbzActivity, MbzActivityContent, MbzFileRef, MbzVfs } from "../types";
import { textOf, unescapeHtmlEntities, unescapeXmlEntities, xmlParser } from "../xml";

function deepUnescapeStrings(value: unknown): unknown {
  if (typeof value === "string") return unescapeHtmlEntities(value);
  if (Array.isArray(value)) return value.map(deepUnescapeStrings);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deepUnescapeStrings(v);
    }
    return out;
  }
  return value;
}

function getHvpRoot(doc: Record<string, unknown>): Record<string, unknown> {
  // <activity><hvp>…</hvp></activity> or bare <hvp>
  if (doc.hvp && typeof doc.hvp === "object" && !Array.isArray(doc.hvp)) {
    return doc.hvp as Record<string, unknown>;
  }
  const activity = doc.activity;
  if (activity && typeof activity === "object") {
    const act = activity as Record<string, unknown>;
    if (act.hvp && typeof act.hvp === "object" && !Array.isArray(act.hvp)) {
      return act.hvp as Record<string, unknown>;
    }
    return act;
  }
  return doc;
}

function pickRenderer(
  machineName: string
): "multichoice" | "truefalse" | "questionset" | "column" | "generic" {
  if (machineName === "H5P.MultiChoice") return "multichoice";
  if (machineName === "H5P.TrueFalse") return "truefalse";
  if (machineName === "H5P.QuestionSet") return "questionset";
  if (machineName === "H5P.Column") return "column";
  return "generic";
}

/** Extract raw intro from XML (entity-escaped). */
function extractIntroRaw(hvp: Record<string, unknown>, rawXml: string): string | null {
  const fromObj = textOf(hvp.intro).trim();
  if (fromObj && fromObj !== "$@NULL@$") return fromObj;
  const re = /<intro(?:\s[^>]*)?>([\s\S]*?)<\/intro>/i;
  const m = rawXml.match(re);
  const body = m?.[1]?.trim() ?? "";
  if (body && body !== "$@NULL@$") return body;
  return null;
}

/**
 * Pull <json_content> from raw XML *before* fast-xml-parser unescapes it.
 * Parser auto-unescape turns &quot; inside HTML strings into real quotes and
 * breaks JSON.parse (classic Moodle H5P backup issue).
 */
function extractJsonContentRaw(rawXml: string): string | null {
  const cdata = rawXml.match(
    /<json_content(?:\s[^>]*)?>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/json_content>/i
  );
  if (cdata?.[1]) return cdata[1].trim();

  const plain = rawXml.match(/<json_content(?:\s[^>]*)?>([\s\S]*?)<\/json_content>/i);
  if (plain?.[1]) return plain[1].trim();
  return null;
}

function parseH5pJson(escapedOrRaw: string): unknown {
  // Outer layer: XML entities only (&lt; &gt; &quot; &amp;) → valid JSON string
  const candidates = [
    unescapeXmlEntities(escapedOrRaw),
    escapedOrRaw, // already unescaped / CDATA
  ];

  let lastError: Error | null = null;
  for (const candidate of candidates) {
    try {
      return deepUnescapeStrings(JSON.parse(candidate));
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  // Last resort: repair bare & that aren't entities (invalid in JSON)
  try {
    const repaired = unescapeXmlEntities(escapedOrRaw).replace(/&(?!#?\w+;)/g, "\\u0026");
    return deepUnescapeStrings(JSON.parse(repaired));
  } catch {
    /* fall through */
  }

  throw lastError ?? new Error("JSON.parse failed");
}

export function decodeH5P(
  vfs: MbzVfs,
  activity: MbzActivity,
  fileIndex: Map<string, MbzFileRef>,
  resolveBlobUrl: ResolveBlobUrl
): MbzActivityContent {
  const raw = vfsText(vfs, activity.rawXmlPath);
  if (!raw) {
    return { kind: "raw", note: `missing hvp payload at ${activity.rawXmlPath}` };
  }
  const doc = xmlParser.parse(raw) as Record<string, unknown>;
  const hvp = getHvpRoot(doc);

  const machineName = textOf(hvp.machine_name || hvp.machinename) || "unknown";
  const version =
    [textOf(hvp.major_version), textOf(hvp.minor_version)].filter(Boolean).join(".") ||
    textOf(hvp.version) ||
    "";

  let introHtml: string | null = null;
  const referencedFiles: MbzFileRef[] = [];
  const unresolvedTokens: string[] = [];
  const introRaw = extractIntroRaw(hvp, raw);
  if (introRaw) {
    const decoded = decodeHtmlField(introRaw, fileIndex, resolveBlobUrl);
    introHtml = decoded.html;
    referencedFiles.push(...decoded.referencedFiles);
    unresolvedTokens.push(...decoded.unresolvedTokens);
  }

  // Prefer raw XML extraction (entity-escaped). Fall back to parser text.
  const jsonEscaped =
    extractJsonContentRaw(raw) ||
    (typeof hvp.json_content === "string" ? hvp.json_content : textOf(hvp.json_content));

  if (!jsonEscaped || jsonEscaped === "$@NULL@$") {
    if (introHtml) {
      return {
        kind: "h5p",
        machineName,
        version,
        parsed: null,
        renderer: "generic",
        introHtml,
        referencedFiles,
        unresolvedTokens,
      };
    }
    return { kind: "raw", note: "hvp missing json_content" };
  }

  let parsed: unknown;
  try {
    parsed = parseH5pJson(jsonEscaped);
  } catch (e) {
    // Still show intro if we have it
    if (introHtml) {
      return {
        kind: "h5p",
        machineName,
        version,
        parsed: {
          _parseError: e instanceof Error ? e.message : String(e),
          _rawPreview: jsonEscaped.slice(0, 500),
        },
        renderer: "generic",
        introHtml,
        referencedFiles,
        unresolvedTokens,
      };
    }
    return {
      kind: "raw",
      note: `failed to parse hvp json_content: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  return {
    kind: "h5p",
    machineName,
    version,
    parsed,
    renderer: pickRenderer(machineName),
    introHtml,
    referencedFiles,
    unresolvedTokens,
  };
}
