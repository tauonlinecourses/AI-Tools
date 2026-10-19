export interface Tool {
  id:          string;
  name:        string;
  description: string;
  /**
   * Same-origin path on the hub Vercel project (no separate deploy).
   * When set, the hub opens this route in-app — no auth handoff.
   */
  hubPath?:    string;
  /** Full Vercel URL for standalone tool apps. Omit when `hubPath` is set. */
  url?:        string;
  /** Local Vite URL when opening a standalone tool from hub DEV (not used for hubPath tools). */
  devUrl?:     string;
  icon:        string;       // Black-and-white icon name (never emoji)
  status:      "live" | "beta" | "coming-soon";
  category:    string;
}

/** True when this tool can be opened from the current hub build. */
export function toolIsOpenable(tool: Tool): boolean {
  if (tool.status === "coming-soon") return false;
  if (tool.hubPath) return true;
  if (import.meta.env.DEV) return Boolean(tool.devUrl);
  return Boolean(tool.url);
}

/** Absolute URL (or path) used for standalone-tool handoff. Not for hubPath tools. */
export function toolHref(tool: Tool): string {
  if (tool.hubPath) {
    throw new Error(`${tool.id} is hub-hosted — use hubPath navigation, not handoff`);
  }
  if (import.meta.env.DEV) {
    if (!tool.devUrl) throw new Error(`${tool.id} has no devUrl`);
    return tool.devUrl;
  }
  if (!tool.url) {
    throw new Error(`${tool.id} has no production URL`);
  }
  return tool.url;
}

/** Tool URL with `?lang=` so PageLayout can show the matching hub header locale. */
export function toolHrefWithLocale(tool: Tool, locale: "en" | "he"): string {
  const href = toolHref(tool);
  try {
    const url = new URL(href);
    url.searchParams.set("lang", locale);
    return url.toString();
  } catch {
    const join = href.includes("?") ? "&" : "?";
    return `${href}${join}lang=${locale}`;
  }
}

export const tools: Tool[] = [
  // ── Add your tools here ─────────────────────────────────────────────
  {
    id:          "video-curator",
    name:        "Video Curator",
    description: "Curate video transcripts into sections, then export clips, SRT, and PDF.",
    url:         "https://ai-tools-video-curator.vercel.app",
    devUrl:      "http://localhost:5174",
    icon:        "film",
    status:      "live",
    category:    "Video",
  },
  {
    id:          "course-builder",
    name:        "Course Builder",
    description: "Author course structure and page content; review view for Moodle/edX implementers.",
    url:         "https://ai-tools-course-builder.vercel.app",
    devUrl:      "http://localhost:5176",
    icon:        "book",
    status:      "beta",
    category:    "Education",
  },
  {
    id:          "mbz-explorer",
    name:        "MBZ Explorer",
    description: "Inspect Moodle .mbz course backups — structure, activities, and decoded content.",
    // Hosted inside the hub Vercel project (not a separate app deploy).
    hubPath:     "/mbz-explorer",
    icon:        "zip",
    status:      "beta",
    category:    "Tech",
  },
  {
    id:          "tau-support",
    name:        "TAU Support",
    description: "AI-powered support assistant for TAU staff and students.",
    url:         "https://ai-tools-tau-support.vercel.app",
    devUrl:      "http://localhost:5178",
    icon:        "page-question",
    status:      "beta",
    category:    "Education",
  },
  {
    id:          "dictionary-tool",
    name:        "Dictionary Tool",
    description: "Convert an Excel glossary (term + definition) into Moodle-importable XML.",
    // Hosted inside the hub Vercel project (not a separate app deploy).
    hubPath:     "/dictionary-tool",
    icon:        "book",
    status:      "beta",
    category:    "Education",
  },
];

export const categories = [...new Set(tools.map((t) => t.category))];

/**
 * Resolve a tool deep-link / `returnUrl` to a catalog entry.
 * Only matches known `hubPath`, production `url`, or `devUrl` origins (no open redirects).
 */
export function findToolForReturnUrl(returnUrl: string): Tool | null {
  let parsed: URL;
  try {
    parsed = new URL(returnUrl);
  } catch {
    return null;
  }

  const path = parsed.pathname.replace(/\/+$/, "") || "/";

  for (const tool of tools) {
    if (tool.hubPath) {
      const base = tool.hubPath.replace(/\/+$/, "") || "/";
      if (path === base || path.startsWith(`${base}/`)) {
        return tool;
      }
      continue;
    }

    for (const candidate of [tool.url, tool.devUrl]) {
      if (!candidate) continue;
      try {
        if (new URL(candidate).origin === parsed.origin) return tool;
      } catch {
        /* skip invalid catalog URL */
      }
    }
  }

  return null;
}
