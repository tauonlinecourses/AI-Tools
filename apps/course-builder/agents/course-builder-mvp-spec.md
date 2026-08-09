# Course Builder — Project Structure

Internal workflow tool for course **builders** and **implementers** — not student-facing at any point. Builders design course structure and page content here; implementers use it as a reference to manually implement the course in Moodle or edX. MVP = authoring + review views only.

**Status: MVP implemented** (authoring + review, Supabase-backed). This doc reflects the implementation as built.

## Stack (as implemented)

The original spec called for Next.js; the MVP was adapted to the monorepo conventions (`agents/workspace/`):

- React + Vite SPA (port 5176), `react-router-dom` for routing
- Supabase (Postgres) via `@supabase/supabase-js` **directly from the browser** — no API routes needed (single-user MVP, no auth). Relational schema, no jsonb blob.
- `@workspace/ui` + shared Tailwind tokens (not shadcn/ui) — `PageLayout` chrome, Button/Card/Input/Badge/Spinner
- dnd-kit (drag-and-drop reordering of sections, pages, and components)

Env (in `apps/course-builder/.env`, see `.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Must be `VITE_`-prefixed for Vite to expose them; the anon key is public by design.

## Data Model

Applied to the live Supabase project; committed at [`supabase/schema.sql`](../supabase/schema.sql) (do not re-run against the existing DB).

```
courses
  id (uuid, pk)
  title
  description
  created_at, updated_at (trigger-bumped)

sections
  id (uuid, pk)
  course_id (fk -> courses, cascade)
  title
  position (int)

pages
  id (uuid, pk)
  section_id (fk -> sections, cascade)
  title
  position (int)
  notes (text, nullable — free-text notes about the page, shown in both editor and review view, for implementers)

components
  id (uuid, pk)
  page_id (fk -> pages, cascade)
  type (text: 'banner' | 'video' | 'text' | 'question')
  position (int)
  props (jsonb — type-specific fields)
  implemented_at (timestamptz, nullable)
  updated_at (trigger-bumped on ANY update, incl. reorder)
```

Ordering: simple integer `position`, renumbered to array index on reorder (`renumber()` in `src/lib/api.ts`).

## Component Types (MVP)

| Type | Key props | UI notes |
|---|---|---|
| `banner` | title (שם הבאנר), imageUrl | Wide 4:1 placeholder: default label `באנר - {page numbering} \| {page title}` (overrides to custom `title` when set); image URL as cover when set; "ללא קובץ" when no URL. Click opens image URL in a new tab. Lighter top strip (`#6B6B6B`) in edit only — hidden in review. Edit settings above placeholder (name placeholder shows default + image URL); toggle via card header or chevron. New banners open settings. No subtitle. Review shows placeholder only (no URL under it). |
| `video` | title (optional display name), url, provider ('youtube' \| 'panopto' \| 'other') | Black aspect-video placeholder: default label `{page title} \| סרטון מספר N` (N = 1-based video index on the page); overrides to custom `title` when set. Circular play icon + "ללא קובץ" when no URL. Top chevron bar in edit only (hidden in review). Click opens URL in a new tab. Edit settings above placeholder: שם הסרטון (placeholder shows default), URL, פלטפורמה — toggle via card header or chevron. New videos open settings. Review: placeholder only (no URL under it). |
| `text` | markdown (plain pre-wrapped in review — no md renderer yet) | Edit: auto-growing textarea with same `p-4` card padding and typography as review. |
| `question` | questionType ('single_choice'), prompt, options[] ({id, text}), correctOptionId | |

TypeScript interfaces: `src/lib/types.ts`.

## App Structure (actual files)

```
apps/course-builder/
  supabase/schema.sql            → committed copy of the applied DB schema
  api/chat.ts                    → legacy AI route (kept; unused by MVP)
  src/
    App.tsx                      → BrowserRouter + routes
    lib/
      supabase.ts                → supabase-js client (VITE_SUPABASE_* env)
      types.ts                   → entities, block props, status derivation
      api.ts                     → CRUD, reorder/renumber, rollups, markImplemented
      saveStatus.tsx             → SaveStatusProvider + Hebrew nav indicator (שומר / נשמרו)
    pages/
      CoursesPage.tsx            → course list (counts, last updated) + create/delete
    components/
      CourseShell.tsx            → shared editor/review layout (sidebar + main)
      PageContent.tsx            → page header, notes, component list, add picker
      SortableList.tsx           → generic dnd-kit vertical sortable wrapper
      StatusBadge.tsx            → implemented / needs_update / not_implemented badge
      icons.tsx                  → monochrome SVG icons
      blocks/
        BlockRenderer.tsx        → switch on type; single component set for both views
        BannerBlock.tsx, VideoBlock.tsx, TextBlock.tsx, QuestionBlock.tsx
        fields.tsx               → shared labeled field primitives
```

### Routes

| Route | Purpose |
|---|---|
| `/` | Home — list of courses (name, section count, page count, last updated) + create/delete |
| `/courses/:courseId` | Redirects to `/edit` |
| `/courses/:courseId/edit` | Editor view (CourseShell `editable=true`) |
| `/courses/:courseId/review` | Implementer view (CourseShell `editable=false`) — read-only mirror + status |

Selected page is a `?page=<pageId>` search param, preserved when toggling edit/review. Deep links work on Vercel via the SPA rewrite in `vercel.json` (`/((?!api/).*)` → `/index.html`).

## Implementation Status Tracking

Status is **derived from timestamps**, not stored:

- `implemented_at is null` → **not_implemented**
- `implemented_at < updated_at` → **needs_update** (edited since last implementation; reordering also bumps `updated_at` by design)
- `implemented_at >= updated_at` → **implemented**

"Mark as implemented" (review view, per component): sets `implemented_at = now()`; the `updated_at` trigger fires in the same statement so both get the same timestamp → implemented.

- Per-component status is derived **client-side** (`componentStatus()` in `types.ts`, same logic as the `component_status` view) since components are already loaded.
- Page/section rollups ("3/5 הוטמעו") come from the `page_status` / `section_status` DB views (`getStatusRollups()`), refreshed after any status-affecting change. Shown in review mode only (sidebar counts + page header line).

## UI / RTL

- Content is `dir="rtl" lang="he"` below the shared `PageLayout` top nav (which stays LTR English per monorepo conventions). Tailwind logical properties (`ms-`/`me-`/`ps-`/`pe-`/`border-s/e`) throughout.
- **Chrome colors**: sidebar `bg-[#F8F9FA]` at `w-80` (no divider border toward the main pane), main canvas `bg-white`. Component card headers use the same `#F8F9FA`. Sidebar row/mode-toggle hovers use `bg-white` so they still contrast on the tinted sidebar.
- **Fixed split panes**: `CourseShell` locks to `h-[calc(100vh-3rem)]` (viewport minus `PageLayout` `h-12` nav) with `overflow-hidden`. Sidebar and main each scroll independently — main content scroll does not move the sidebar; a long section/page list scrolls inside the sidebar `nav` only.
- **Sidebar (right side, per RTL)**: header is course title (`text-xl`) on the right with edit/review toggle top-left (labels: עריכה / הטמעה), last-updated line under the title (`עודכן ב{he-IL date}` from `course.updated_at`), then back-link ("חזרה לכל הקורסים"). Nav text is one step larger than default body (`text-base` sections/pages, `text-sm` meta/actions). Below: collapsible section list (section title only — no section index) with pages nested as `1.1 | כותרת` (number inherits the row’s size / color, `|` separator). Current page highlighted as an inset pill (`mx-2 rounded-lg bg-[#0F6CBF]` with white text — not full-bleed). Edit mode: hover-revealed drag handle / rename / delete per row, "+ הוסף עמוד" under each section (indented to align with page numbers, accounting for the grip slot), "+ הוסף שיעור" at the bottom (aligned under sections with grip-slot indent only — slightly right of section titles). All hidden in review mode.
- **Main content**: page header matches sidebar page rows — `1.1 | כותרת` (number + `|` + title, no "עמוד …" eyebrow); title is inline-editable in edit mode (`text-3xl`). Notes field ("הערות להטמעה", 1-line `textarea` with vertical resize, debounced save); in review, label above notes with no box/border and red (`text-danger`) body when non-empty. Stacked component cards (drag handle + delete in edit; status badge + "סמן כהוטמע" in review), dashed add-component box with 4 type buttons (edit only). Body/field text is one step larger than default (`text-base` content, `text-sm` labels). Hebrew status labels: הוטמע / לא הוטמע / דורש עדכון; rollup copy uses הוטמעו.
- Inputs keep a static `border-surface-200` with no focus border change and no global `:focus-visible` black ring (form fields are opted out in `@workspace/ui` `globals.css`).
- Block edits are debounced (700ms) and flushed on page switch. Deletes use `window.confirm`.
- **Save status**: top-left of the main page canvas (below the Hub nav, not in the header strip) shows a spinner + "שומר שינויים..." while any mutation is pending (incl. debounce window), then "כל השינויים נשמרו". Wired via `SaveStatusProvider` in `App.tsx`; `PageContent` / `CourseShell` / `CoursesPage` call `trackSave` / `beginSave`/`endSave`.
- dnd-kit vertical sorting is axis-independent, so RTL is safe; drag activates after 5px so clicks still select.

## Notes / caveats

- No auth and no RLS — the anon key has full read/write. Before sharing a public Vercel URL: enable Vercel deployment protection or add RLS. Not a local-dev concern.
- Block renderers take `props` + `editable: boolean` — one component set for editor and review.
- `components.props` is the only jsonb field; everything else is normalized columns.
- Course `updated_at` only bumps on title/description edits (per-table trigger), not on nested content edits.
