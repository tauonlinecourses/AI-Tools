export interface Tool {
  id: string;
  name: string;
  description: string;
  /** Route inside the platform, e.g. "/tools/video-curator". */
  path: string;
  /** Black-and-white icon name — key into the hub's icon map (never emoji). */
  icon: string;
}

/**
 * Single source of truth for the hub grid.
 * Adding a tool = one entry here + one import in `agents/registry.ts`.
 * The `_starter` template is intentionally NOT listed (and not routed).
 */
export const tools: Tool[] = [];
