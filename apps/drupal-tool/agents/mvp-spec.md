# Drupal Helper — MVP spec

## Status

Catalog status: `beta` (openable on this branch; publish by merging). Hub-hosted at `/drupal-tool`.

## Planned product

1. **Component bank** — reusable Drupal-ready HTML/CSS snippets with one-click copy to clipboard.
2. **Image generator** — generate images aligned to Drupal site design tokens / layouts (AI wiring later).

## Current UI

- Hebrew `PageLayout` shell.
- Centered main container: **70% × 80%** of the area under the hub header (`calc(100vh - 3rem)` stage). Inline `width`/`height` so sizing is reliable when hub-hosted. Mode toggle on top; content fills the rest and scrolls if needed.
- RTL order puts **בנק רכיבים** on the right and **מחולל תמונות** on the left. Active segment is black/white (course-builder segmented pattern).
- Toggle switches page body between `ComponentBankPanel` and `ImageGeneratorPanel`.
- Default mode: `components` (בנק רכיבים).
- `PageLayout` uses `maxWidth="full"` + `padded={false}`.

### בנק רכיבים (implemented)

- Data: `src/data/componentBank.ts` — `{ id, title, description?, html, fields: { href, text }, editables? }`. `html` uses `{{href}}` / `{{text}}` placeholders; `renderComponentHtml` fills them for preview + copy.
- UI: `src/components/ComponentBankPanel.tsx` — vertical list of sections.
- Each section: title + **העתק HTML**; **preview** + **settings** inputs (קישור הכפתור, טקסט הכפתור). Changing inputs updates live preview and the copied HTML.
- Raw HTML script pane is **hidden** (not deleted) via `SHOW_HTML_SCRIPT_SECTION = false`.
- User-facing copy must not use em/en dashes (`—` / `–`).

Image generator remains a placeholder. No AI API, no separate Vercel project.

## IDs

| Field | Value |
|---|---|
| Hub / auth id | `drupal-tool` |
| Hub path | `/drupal-tool` |
| Package | `apps/drupal-tool` |
| Vite port (standalone) | `5181` |
