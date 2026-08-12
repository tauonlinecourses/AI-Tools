/**
 * Sidebar logos for Moodle activity modtypes (assets in `public/`).
 * Types without a logo keep the text `type | name` prefix in the tree.
 */
export type ActivityIcon = {
  src: string;
  label: string;
  /** Monochrome SVGs invert to white on the selected blue pill. */
  invertWhenSelected: boolean;
};

const ICONS: Record<string, ActivityIcon> = {
  page: {
    src: "/page-logo.svg",
    label: "page",
    invertWhenSelected: true,
  },
  hvp: {
    src: "/h5p-logo.svg",
    label: "h5p",
    invertWhenSelected: false,
  },
  forum: {
    src: "/forum-icon.svg",
    label: "forum",
    invertWhenSelected: true,
  },
  assign: {
    src: "/task-logo.svg",
    label: "assign",
    invertWhenSelected: true,
  },
  glossary: {
    src: "/dictunary-logo.svg",
    label: "glossary",
    invertWhenSelected: true,
  },
  board: {
    src: "/notes-board-logo.svg",
    label: "board",
    invertWhenSelected: true,
  },
};

export function activityTypeIcon(type: string): ActivityIcon | null {
  return ICONS[type] ?? null;
}
