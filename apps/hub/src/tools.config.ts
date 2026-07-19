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

export const tools: Tool[] = [
  // ── Add your tools here ─────────────────────────────────────────────
  {
    id:          "tool-starter",
    name:        "Starter Tool",
    description: "Use this template to create new tools",
    url:         "https://tool-starter.vercel.app",
    devUrl:      "http://localhost:5175",
    icon:        "bolt",
    status:      "beta",
    category:    "General",
  },
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
  // ── Example entries (fill in real URLs after deploying) ─────────────
  // {
  //   id:          "tool-auth",
  //   name:        "Auth Scanner",
  //   description: "AI-powered trading card authentication.",
  //   url:         "https://tool-auth.vercel.app",
  //   devUrl:      "http://localhost:5176",
  //   icon:        "search",
  //   status:      "live",
  //   category:    "TruLux",
  // },
];

export const categories = [...new Set(tools.map((t) => t.category))];
