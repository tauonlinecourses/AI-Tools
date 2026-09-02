export interface Tool {
  id:          string;
  name:        string;
  description: string;
  url:         string;       // Full Vercel URL (production / Vercel deploy)
  devUrl:      string;       // Local Vite URL when hub runs in `vite` DEV
  icon:        string;       // Black-and-white icon name (never emoji)
  status:      "live" | "beta" | "coming-soon";
  category:    string;
}

/** Hub DEV → localhost tool; production/Vercel build → live URL. */
export function toolHref(tool: Tool): string {
  return import.meta.env.DEV ? tool.devUrl : tool.url;
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
    url:         "https://ai-tools-mbz-explorer.vercel.app",
    devUrl:      "http://localhost:5177",
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
    icon:        "search",
    status:      "beta",
    category:    "Education",
  },
  // ── Example entries (fill in real URLs after deploying) ─────────────
  // {
  //   id:          "tool-auth",
  //   name:        "Auth Scanner",
  //   description: "AI-powered trading card authentication.",
  //   url:         "https://tool-auth.vercel.app",
  //   devUrl:      "http://localhost:5178",
  //   icon:        "search",
  //   status:      "live",
  //   category:    "TruLux",
  // },
];

export const categories = [...new Set(tools.map((t) => t.category))];
