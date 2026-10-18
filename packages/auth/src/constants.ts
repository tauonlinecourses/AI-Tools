/** Slug of the platform admin group (full hub tool access + admin UI). */
export const ADMIN_GROUP_SLUG = "Admin (all tools)";

/** Tool ids allowed in `group_tools.tool_id` (matches DB check constraint). */
export const PLATFORM_TOOL_IDS = [
  "video-curator",
  "course-builder",
  "mbz-explorer",
  "tau-support",
  "virtual-support",
  "tool-starter",
] as const;

export type PlatformToolId = (typeof PLATFORM_TOOL_IDS)[number];

export function isPlatformToolId(value: string): value is PlatformToolId {
  return (PLATFORM_TOOL_IDS as readonly string[]).includes(value);
}

export function isAdminFromGroups(
  groups: ReadonlyArray<{ slug: string }>
): boolean {
  return groups.some((g) => g.slug === ADMIN_GROUP_SLUG);
}
