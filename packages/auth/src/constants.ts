/**
 * Canonical slug of the platform admin group (full hub tool access + admin UI).
 * Prefer this stable form — the legacy display-like slug is broken by hub
 * `slugify` when the group is edited in Admin UI.
 */
export const ADMIN_GROUP_SLUG = "admin-all-tools";

/** Pre-normalization slug (spaces/parens). Still recognized for membership checks. */
export const ADMIN_GROUP_SLUG_LEGACY = "Admin (all tools)";

export const ADMIN_GROUP_SLUGS = [
  ADMIN_GROUP_SLUG,
  ADMIN_GROUP_SLUG_LEGACY,
] as const;

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

export function isAdminGroupSlug(slug: string): boolean {
  return (ADMIN_GROUP_SLUGS as readonly string[]).includes(slug);
}

export function isAdminFromGroups(
  groups: ReadonlyArray<{ slug: string }>
): boolean {
  return groups.some((g) => isAdminGroupSlug(g.slug));
}
