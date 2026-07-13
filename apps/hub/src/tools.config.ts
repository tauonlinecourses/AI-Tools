export interface Tool {
  id:          string;
  name:        string;
  description: string;
  url:         string;       // Full Vercel URL in production; relative path in dev
  icon:        string;       // Black-and-white icon name (never emoji)
  status:      "live" | "beta" | "coming-soon";
  category:    string;
}

export const tools: Tool[] = [
  // ── Add your tools here ─────────────────────────────────────────────
  {
    id:          "tool-starter",
    name:        "Starter Tool",
    description: "Template tool — replace this with your first real tool.",
    url:         "https://tool-starter.vercel.app",
    icon:        "bolt",
    status:      "beta",
    category:    "General",
  },
  {
    id:          "video-curator",
    name:        "Video Curator",
    description: "Curate video transcripts into sections, then export clips, SRT, and PDF.",
    url:         "https://ai-video-tools-tan.vercel.app",
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
  //   icon:        "search",
  //   status:      "live",
  //   category:    "TruLux",
  // },
];

export const categories = [...new Set(tools.map((t) => t.category))];
