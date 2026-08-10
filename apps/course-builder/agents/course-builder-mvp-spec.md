# Course Builder — Project Structure

Internal workflow tool for course **builders** and **implementers** — not student-facing at any point. Builders design course structure and page content here; implementers use it as a reference to manually implement the course in Moodle or edX. Also includes a polished **preview** (תצוגה) of the page without implementer chrome.

**Status: MVP implemented** (authoring + implement + preview, Supabase-backed). This doc reflects the implementation as built.

## Stack (as implemented)

The original spec called for Next.js; the MVP was adapted to the monorepo conventions (`agents/workspace/`):

- React + Vite SPA (port 5176), `react-router-dom` for routing
- Supabase (Postgres) via `@supabase/supabase-js` **directly from the browser** — no API routes needed (single-user MVP, no auth). Relational schema, no jsonb blob.
- `@workspace/ui` + shared Tailwind tokens (not shadcn/ui) — `PageLayout` chrome, Button/Card/Input/Badge/Spinner
- dnd-kit (drag-and-drop reordering of sections, pages, and components)

Env (in `apps/course-builder/.env`, see `.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Must be `VITE_`-prefixed for Vite to expose them; the anon key is public by design.

## Data Model

Applied to the live Supabase project; committed at [`supabase/schema.sql`](../supabase/schema.sql) (do not re-run the full file against the existing DB). Newer helpers such as `mark_component_implemented` should be applied once via the SQL editor if missing. Course home page support is in [`supabase/migrations/001_course_home_page.sql`](../supabase/migrations/001_course_home_page.sql) — apply once if the live DB still has `pages.section_id` NOT NULL.

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
  section_id (fk -> sections, cascade, nullable)
  course_id (fk -> courses, cascade, nullable)
  title
  position (int)
  notes (text, nullable — free-text notes about the page, shown in editor and implement view, for implementers; hidden in preview)
  constraint: exactly one of section_id / course_id is set
    - lesson page: section_id set, course_id null
    - course home page ("עמוד ראשי"): course_id set, section_id null (unique per course)

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

**Course home page ("עמוד ראשי")**: every course gets one by default (`createCourse` + `ensureHomePage` on tree load for existing courses). It appears in the sidebar **above** the first lesson, title-only (no `1.1` numbering). Same component editor as other pages. Rename allowed; delete disabled. Not nested under a section and not included in section reorder/DnD. `ensureHomePage` tolerates a unique-index race (parallel Strict Mode loads): on insert conflict it re-fetches the existing row.

## Component Types (MVP)

| Type | Key props | UI notes |
|---|---|---|
| `banner` | title (שם הבאנר), imageUrl | Wide 4:1 placeholder: default label `באנר - {page numbering} \| {page title}` (overrides to custom `title` when set); image URL as cover when set; "ללא קובץ" when no URL or the image fails to load. Click opens image URL in a new tab. Lighter top strip (`#6B6B6B`) in edit only — hidden in implement/preview. Edit settings above placeholder (name placeholder shows default + image URL); toggle via card header or chevron. New banners open settings. No subtitle. Implement + preview show placeholder only (no URL under it). **Preview (תצוגה)**: title overlay is hidden only when the image actually paints; if a URL is set but the image does not show (broken/blocked URL), the banner name (+ "ללא קובץ") stays visible. |
| `video` | title (optional display name), url, provider ('youtube' \| 'panopto' \| 'other') | Black aspect-video placeholder in edit/implement: default label `{page title} \| סרטון מספר N` (N = 1-based video index on the page); overrides to custom `title` when set. Circular play icon + "ללא קובץ" when no URL. Top chevron bar in edit only. Click opens URL in a new tab (edit/implement). Edit settings above placeholder: שם הסרטון, URL, פלטפורמה. **Preview (תצוגה)**: embeds via iframe when URL resolves (`src/lib/videoEmbed.ts` — YouTube id → embed URL; Panopto/`other` use URL as iframe src); falls back to placeholder when no embeddable URL. |
| `text` | markdown (plain pre-wrapped in implement/preview — no md renderer yet) | Edit: auto-growing textarea with same typography as read-only views. |
| `question` | questionType ('single_choice'), prompt, options[] ({id, text}), correctOptionId | Implement: header copy icon copies the prompt; each option row has a copy icon that copies that option's text (both mark the component implemented). Preview: same read-only options, no copy controls. |

TypeScript interfaces: `src/lib/types.ts` (`CourseViewMode = "edit" | "implement" | "review"`).

## App Structure (actual files)

```
apps/course-builder/
  supabase/schema.sql            → committed copy of the applied DB schema
  api/chat.ts                    → legacy AI route (kept; unused by MVP)
  src/
    App.tsx                      → BrowserRouter + routes
    lib/
      supabase.ts                → supabase-js client (VITE_SUPABASE_* env)
      types.ts                   → entities, block props, CourseViewMode, status derivation
      videoEmbed.ts              → resolve YouTube/Panopto/other iframe src for preview
      api.ts                     → CRUD, reorder/renumber, rollups, setComponentStatus / markImplemented
      saveStatus.tsx             → SaveStatusProvider + Hebrew nav indicator (שומר / נשמרו)
    pages/
      CoursesPage.tsx            → course list (counts, last updated) + create/delete; eye → /review
    components/
      CourseShell.tsx            → shared layout (sidebar + main) for all three modes
      PageContent.tsx            → page header, notes, component list, add picker
      SortableList.tsx           → generic dnd-kit vertical sortable wrapper
      StatusBadge.tsx            → implemented / needs_update / not_implemented badge (implement: larger clickable control with swap arrows; click cycles status)
      icons.tsx                  → monochrome SVG icons
      blocks/
        BlockRenderer.tsx        → switch on type; single component set for all modes
        BannerBlock.tsx, VideoBlock.tsx, TextBlock.tsx, QuestionBlock.tsx
        fields.tsx               → shared labeled field primitives
```

### Routes

| Route | Purpose |
|---|---|
| `/` | Home — list of courses (name, section count, page count, last updated) + create/delete |
| `/courses/:courseId` | Redirects to `/edit` |
| `/courses/:courseId/edit` | Editor (`CourseShell mode="edit"`) |
| `/courses/:courseId/implement` | Implementer view (`mode="implement"`) — read-only cards + status/copy/notes |
| `/courses/:courseId/review` | Polished preview (`mode="review"` / תצוגה) — no cards/notes/status; video embeds |

Selected page is a `?page=<pageId>` search param, preserved when toggling modes. Deep links work on Vercel via the SPA rewrite in `vercel.json` (`/((?!api/).*)` → `/index.html`).

### Mode matrix

| | Edit (עריכה) | Implement (הטמעה) | Preview (תצוגה) |
|---|---|---|---|
| Sidebar CRUD / DnD | yes | no | no |
| Status rollups | no | yes | no |
| Notes | editable | red read-only when set | hidden |
| Component cards / headers | yes | yes + status + copy | no — plain stacked blocks |
| Video | placeholder + settings | placeholder + link-out | iframe embed when URL exists |

## Implementation Status Tracking

Status is **derived from timestamps**, not stored:

- `implemented_at is null` → **not_implemented**
- `implemented_at < updated_at` → **needs_update** (edited since last implementation; reordering also bumps `updated_at` by design)
- `implemented_at >= updated_at` → **implemented**

"Mark as implemented" (implement view): each component card has an icon-only copy control (overlapping-rectangles icon, no border/label) that copies type-specific content to the clipboard, then calls `mark_component_implemented` (DB `now()` for `implemented_at`, matching the `updated_at` trigger → status becomes **הוטמע**, not דורש עדכון). Payload by type: `text` → markdown body; `banner` → image URL; `video` → video URL; `question` → prompt text. Question answer rows also get a per-option copy control (visual left in RTL) that copies that option's text and marks the same component implemented.

Clicking the status control (larger badge with swap-arrows icon) cycles `לא הוטמע` → `הוטמע` → `דורש עדכון` → … via `setComponentStatus()` (`implemented_at` null / RPC now / past-relative-to-`updated_at`).

- Per-component status is derived **client-side** (`componentStatus()` in `types.ts`, same logic as the `component_status` view) since components are already loaded.
- Page/section rollups ("3/5 הוטמעו") come from the `page_status` / `section_status` DB views (`getStatusRollups()`), refreshed after any status-affecting change. Shown in **implement** mode only (sidebar counts + page header line). Client normalizes `total_count` as the sum of status buckets so empty pages (no components) never show a phantom `0/1` from a LEFT JOIN `count(*)`. In implement sidebar, a page whose rollup is fully complete (`implemented_count === total_count` and `total_count > 0`) gets a green row tint (`bg-emerald-50` / `text-emerald-900`, matching implemented component headers); selection still uses the blue pill.

## UI / RTL

- Content is `dir="rtl" lang="he"` below the shared `PageLayout` top nav (which stays LTR English per monorepo conventions). Tailwind logical properties (`ms-`/`me-`/`ps-`/`pe-`/`border-s/e`) throughout.
- **Chrome colors**: sidebar `bg-[#F8F9FA]` at `w-80` (no divider border toward the main pane), main canvas `bg-white`. Component card headers use the same `#F8F9FA` in edit mode; in implement they use the status tint (`statusHeaderClass`: emerald / amber / surface). Sidebar row/mode-toggle hovers use `bg-white` so they still contrast on the tinted sidebar.
- **Fixed split panes**: `CourseShell` locks to `h-[calc(100vh-3rem)]` (viewport minus `PageLayout` `h-12` nav) with `overflow-hidden`. Sidebar and main each scroll independently — main content scroll does not move the sidebar; a long section/page list scrolls inside the sidebar `nav` only.
- **Sidebar (right side, per RTL)**: header is course title (`text-xl`) on the right with mode toggle top-left (labels: עריכה / הטמעה / תצוגה), last-updated line under the title (`עודכן ב{he-IL date}` from `course.updated_at`), then back-link ("חזרה לכל הקורסים"). Nav text is one step larger than default body (`text-base` sections/pages, `text-sm` meta/actions). Below: **עמוד ראשי** (course home page, title-only, no numbering) above the collapsible section list (section title only — no section index) with pages nested as `1.1 | כותרת` (number inherits the row’s size / color, `|` separator). Current page highlighted as an inset pill (`mx-2 rounded-lg bg-[#0F6CBF]` with white text — not full-bleed). In implement mode, fully implemented pages (all components הוטמעו) use `bg-emerald-50` when not selected. Edit mode: hover-revealed drag handle / rename / delete per lesson page row (home page: rename only, no delete/drag), "+ הוסף עמוד" under each section (indented to align with page numbers, accounting for the grip slot), "+ הוסף שיעור" at the bottom (aligned under sections with grip-slot indent only — slightly right of section titles). All hidden in implement and preview modes.
- **Main content**: page header matches sidebar page rows — `1.1 | כותרת` for lesson pages; home page shows title only (no number/`|`); title is inline-editable in edit mode (`text-3xl`). Notes field ("הערות להטמעה", 1-line `textarea` with vertical resize, debounced save) in edit; in implement, label above notes with no box/border and red (`text-danger`) body when non-empty; **hidden in preview**. Edit/implement: stacked component cards (drag handle + delete in edit; in implement the full card header is tinted to the status color with a larger clickable status control — swap-arrows icon + label — that cycles + icon-only copy). Preview: blocks stacked without cards/headers. Dashed add-component box with 4 type buttons (edit only). Body/field text is one step larger than default (`text-base` content, `text-sm` labels). Hebrew status labels: הוטמע / לא הוטמע / דורש עדכון; rollup copy uses הוטמעו.
- Inputs keep a static `border-surface-200` with no focus border change and no global `:focus-visible` black ring (form fields are opted out in `@workspace/ui` `globals.css`).
- Block edits are debounced (700ms) and flushed on page switch. Deletes use `window.confirm`.
- **Save status**: top-left of the main page canvas (below the Hub nav, not in the header strip) shows a spinner + "שומר שינויים..." while any mutation is pending (incl. debounce window), then "כל השינויים נשמרו". Wired via `SaveStatusProvider` in `App.tsx`; `PageContent` / `CourseShell` / `CoursesPage` call `trackSave` / `beginSave`/`endSave`.
- dnd-kit vertical sorting is axis-independent, so RTL is safe; drag activates after 5px so clicks still select.

## Notes / caveats

- No auth and no RLS — the anon key has full read/write. Before sharing a public Vercel URL: enable Vercel deployment protection or add RLS. Not a local-dev concern.
- Block renderers take `props` + `mode: CourseViewMode` — one component set for edit, implement, and preview.
- `components.props` is the only jsonb field; everything else is normalized columns.
- Course `updated_at` only bumps on title/description edits (per-table trigger), not on nested content edits.
