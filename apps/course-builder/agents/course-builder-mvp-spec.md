# Course Builder â€” Project Structure

Internal workflow tool for course **builders** and **implementers** â€” not student-facing at any point. Builders design course structure and page content here; implementers use it as a reference to manually implement the course in Moodle or edX. Also includes a polished **preview** (×ª×¦×•×’×”) of the page without implementer chrome.

**Status: MVP implemented** (authoring + implement + preview, Supabase-backed). This doc reflects the implementation as built.

## Stack (as implemented)

The original spec called for Next.js; the MVP was adapted to the monorepo conventions (`agents/workspace/`):

- React + Vite SPA (port 5176), `react-router-dom` for routing
- Supabase (Postgres) via `@supabase/supabase-js` **directly from the browser** â€” no API routes needed (single-user MVP, no auth). Relational schema, no jsonb blob.
- `@workspace/ui` + shared Tailwind tokens (not shadcn/ui) â€” `PageLayout` chrome, Button/Card/Input/Badge/Spinner
- dnd-kit (drag-and-drop reordering of sections, pages, and components)

Env (in `apps/course-builder/.env`, see `.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Must be `VITE_`-prefixed for Vite to expose them; the anon key is public by design.

## Data Model

Applied to the live Supabase project; committed at [`supabase/schema.sql`](../supabase/schema.sql) (do not re-run the full file against the existing DB). Newer helpers such as `mark_component_implemented` should be applied once via the SQL editor if missing. Course home page support is in [`supabase/migrations/001_course_home_page.sql`](../supabase/migrations/001_course_home_page.sql) â€” apply once if the live DB still has `pages.section_id` NOT NULL. Lesson overview columns are in [`supabase/migrations/004_section_lesson_info.sql`](../supabase/migrations/004_section_lesson_info.sql). Page readiness is in [`supabase/migrations/005_page_workflow_status.sql`](../supabase/migrations/005_page_workflow_status.sql).

```
courses
  id (uuid, pk)
  title
  description
  created_at, updated_at (trigger-bumped on direct course edits; also bumped by `touchCourse()` after nested content mutations)

sections
  id (uuid, pk)
  course_id (fk -> courses, cascade)
  title
  position (int)
  opens_at (date, nullable â€” ×ª××¨×™×š ×¤×ª×™×—×”)
  assignments_due_at (date, nullable â€” ×ª××¨×™×š ××—×¨×•×Ÿ ×œ×”×’×©×ª ×ž×˜×œ×•×ª/×ª×¨×’×™×œ×™×)
  files_folder_url (text, nullable â€” ×œ×™× ×§ ×œ×ª×™×§×™×™×ª ×§×‘×¦×™× ×©×œ ×”×©×™×¢×•×¨)
  created_at

pages
  id (uuid, pk)
  section_id (fk -> sections, cascade, nullable)
  course_id (fk -> courses, cascade, nullable)
  title
  position (int)
  notes (text, nullable â€” free-text notes about the page, shown in editor and implement view, for implementers; hidden in preview)
  workflow_status (text: 'in_progress' | 'ready_for_implementation'; new pages default to in_progress)
  constraint: exactly one of section_id / course_id is set
    - lesson page: section_id set, course_id null
    - course home page ("×¢×ž×•×“ ×¨××©×™"): course_id set, section_id null (unique per course)

components
  id (uuid, pk)
  page_id (fk -> pages, cascade)
  type (text: 'banner' | 'video' | 'text' | 'question')
  position (int)
  props (jsonb â€” type-specific fields)
  implemented_at (timestamptz, nullable)
  updated_at (trigger-bumped on ANY update, incl. reorder)

component_comments
  id (uuid, pk)
  component_id (fk -> components, cascade)
  author_role (text: 'edit' | 'implement' | 'review' â€” view role, not a person)
  body (text)
  resolved_at (timestamptz, nullable â€” null = open)
  created_at
```

Ordering: simple integer `position`, renumbered to array index on reorder (`renumber()` in `src/lib/api.ts`).

**Block comments** (Word-style): one chronological thread per component. Migration [`supabase/migrations/003_component_comments.sql`](../supabase/migrations/003_component_comments.sql) â€” apply once via SQL editor if the live DB does not have the table yet. Comment mutations do **not** bump `components.updated_at` or course `updated_at` (must not flip implementer status to ×¢×‘×¨ ×©×™× ×•×™). Author is the view role label (×¦×•×•×ª ×¤×™×ª×•×— ×œ×ž×™×“×” / ×¦×•×•×ª ×”×˜×ž×¢×” / ×¦×•×•×ª ×ž×¨×¦×™×), color-coded per role. Resolve is per comment; resolved comments stay visible (strikethrough + green check, no "נפתר" badge) and can be reopened via ×¤×ª×— ×ž×—×“×©. Delete (trash) is available only when the current view mode matches the commentâ€™s `author_role` (same role that published it). Badge count = unresolved only.

**Course home page ("×¢×ž×•×“ ×¨××©×™")**: every course gets one by default (`createCourse` + `ensureHomePage` on tree load for existing courses). It appears in the sidebar **above** the first lesson, title-only (no `1.1` numbering). Same component editor as other pages. Rename allowed; delete disabled. Not nested under a section and not included in section reorder/DnD. `ensureHomePage` tolerates a unique-index race (parallel Strict Mode loads): on insert conflict it re-fetches the existing row.

## Component Types (MVP)

| Type | Key props | UI notes |
|---|---|---|
| `banner` | imageUrl, notes | Wide 4:1 placeholder: label always `×‘×× ×¨ - {page numbering} \| {page title}` (no custom name field); image URL fitted with `object-contain` (full image visible, letterboxed in the 4:1 frame) when set; "×œ×œ× ×§×•×‘×¥" when no URL or the image fails to load. Click opens image URL in a new tab in edit/implement only â€” preview has no link. In edit, a link icon in the block header opens an anchored URL-field popover; there is no accordion/settings panel or placeholder chevron. No subtitle. In all modes, title overlay is hidden only when the image actually paints; if a URL is set but the image does not show (broken/blocked URL), the banner name (+ "×œ×œ× ×§×•×‘×¥") stays visible. Implement: legacy `notes` under the block when set; preview: notes hidden. |
| `video` | title (optional display name), url, provider (auto from URL), notes | Black aspect-video placeholder in edit/implement: default label `{page title} \| ×¡×¨×˜×•×Ÿ ×ž×¡×¤×¨ N` (N = 1-based video index on the page); overrides to custom `title` when set. Circular play icon + "×œ×œ× ×§×•×‘×¥" when no URL. Click opens URL in a new tab (edit/implement). In edit, title + link icons in the block header open anchored single-field popovers (no platform picker). Platform is inferred from the URL via `detectVideoProvider` in `src/lib/videoEmbed.ts` (YouTube id / youtu.be â†’ youtube; `*.panopto.com` â†’ panopto; else other) and stored on save. Implement: legacy `notes` under the block when set. **Preview (×ª×¦×•×’×”)**: embeds via iframe when URL resolves (YouTube â†’ embed URL; Panopto/other use URL as iframe src); falls back to placeholder when no embeddable URL; notes hidden. |
| `text` | html (rich text; legacy `markdown` plain text migrated on edit) | Edit: TipTap WYSIWYG (bold, H1/H2, link icons) with compact RTL toolbar. No per-component notes (body is the content). Implement + preview: sanitized HTML render (`dompurify`). Implement copy: rich clipboard (`text/html` + `text/plain`). |
| `question` | questionType ('single_choice'), prompt, options[] ({id, text}), correctOptionId, notes | Edit: prompt + options (no ×”×¢×¨×•×ª input). Implement: copy icon beside the prompt (visual left in RTL) copies the prompt; each option row has a copy icon that copies that option's text (both mark the component implemented); legacy `notes` under the block when set. Preview: same read-only options, no copy controls / notes. |

Banner, video, and question may still carry optional `props.notes` in jsonb (legacy). **No edit-mode ×”×¢×¨×•×ª input** on blocks â€” use page-level "×”×¢×¨×•×ª ×œ×”×˜×ž×¢×”" and/or block comments instead. When non-empty, notes are still shown under the component in implement (label + red `text-danger` body); **hidden in preview**. Text blocks never had a notes field.

TypeScript interfaces: `src/lib/types.ts` (`CourseViewMode = "edit" | "implement" | "review"`, `NotesProps` on every block props type, `PageType` / `derivePageType` for implement sidebar logos, `ComponentComment` / `CommentAuthorRole` + Hebrew labels and role colors).

## App Structure (actual files)

```
apps/course-builder/
  supabase/schema.sql            â†’ committed copy of the applied DB schema
  supabase/migrations/           â†’ incremental SQL (001 home page, 002 empty rollup, 003 component_comments)
  api/chat.ts                    â†’ legacy AI route (kept; unused by MVP)
  src/
    App.tsx                      â†’ BrowserRouter + routes
    lib/
      supabase.ts                â†’ supabase-js client (VITE_SUPABASE_* env)
      types.ts                   â†’ entities, block props, CourseViewMode, comments, status derivation
      videoEmbed.ts              â†’ resolve YouTube/Panopto/other iframe src for preview
      textHtml.ts                â†’ sanitize / resolve text HTML, plain-text extraction
      clipboard.ts               â†’ writeClipboard (rich HTML + plain, with fallback)
      api.ts                     â†’ CRUD, reorder/renumber, duplicatePage / duplicateSection / duplicateComponent, rollups, getPageTypes, comments, setComponentStatus / markImplemented, touchCourse
      saveStatus.tsx             â†’ SaveStatusProvider + Hebrew nav indicator (×©×•×ž×¨ / × ×©×ž×¨×•)
    pages/
      CoursesPage.tsx            â†’ course list (counts, last updated) + create/delete; eye â†’ /review
    components/
      CourseShell.tsx            â†’ shared layout (sidebar + main) for all three modes
      PageContent.tsx            â†’ page header, PageNotes, component list, add picker, comment loading
      SectionOverview.tsx        → lesson overview (settings + Moodle-style page list)
      PageNotes.tsx              â†’ edit-mode page notes panel (gutter icon + textarea, like BlockComments)
      BlockComments.tsx          â†’ gutter comment icon + Word-style thread panel (all modes)
      SortableList.tsx           â†’ generic dnd-kit vertical sortable wrapper
      StatusBadge.tsx            â†’ implemented / needs_update / not_implemented badge (implement: larger clickable control with swap arrows; click cycles status)
      icons.tsx                  â†’ monochrome SVG icons (default size via className default `w-4 h-4`; pass size override to replace, never stack conflicting Tailwind width/height utilities)
      blocks/
        BlockRenderer.tsx        â†’ switch on type; single component set for all modes
        BannerBlock.tsx, VideoBlock.tsx, TextBlock.tsx, QuestionBlock.tsx
        fields.tsx               â†’ shared labeled field primitives
```

### Routes

| Route | Purpose |
|---|---|
| `/` | Home â€” list of courses (name, section count, page count, last updated) + create/delete |
| `/courses/:courseId` | Redirects to `/edit` |
| `/courses/:courseId/edit` | Editor (`CourseShell mode="edit"`); `?page=` or `?section=` selection |
| `/courses/:courseId/implement` | Implementer view (`mode="implement"`) â€” read-only cards + status/copy/notes; lesson overview via `?section=` |
| `/courses/:courseId/review` | Polished preview (`mode="review"` / ×ª×¦×•×’×”) â€” no cards/notes/status; video embeds; comments available; lesson overview via `?section=` |

Selected page is a `?page=<pageId>` search param, preserved when toggling modes. Deep links work on Vercel via the SPA rewrite in `vercel.json` (`/((?!api/).*)` â†’ `/index.html`).

### Mode matrix

| | Edit (×¢×¨×™×›×”) | Implement (×”×˜×ž×¢×”) | Preview (×ª×¦×•×’×”) |
|---|---|---|---|
| Sidebar CRUD / DnD | yes | no | no |
| Page readiness toggle | yes | no (in-progress pages are disabled) | no |
| Status rollups | no | yes | no |
| Notes (page) | editable | red read-only when set | hidden |
| Notes (per component) | editable in block inputs / settings | red read-only under block when set | hidden |
| Component cards / headers | yes | yes + status + copy | no â€” plain stacked blocks |
| Block comments | yes (author: ×¦×•×•×ª ×¤×™×ª×•×— ×œ×ž×™×“×”) | yes (author: ×¦×•×•×ª ×”×˜×ž×¢×”) | yes (author: ×¦×•×•×ª ×ž×¨×¦×™×) |
| Video | placeholder + settings | placeholder + link-out | iframe embed when URL exists |

## Implementation Status Tracking

Status is **derived from timestamps**, not stored:

- `implemented_at is null` â†’ **not_implemented**
- `implemented_at < updated_at` â†’ **needs_update** (edited since last implementation; reordering also bumps `updated_at` by design)
- `implemented_at >= updated_at` â†’ **implemented**

"Mark as implemented" (implement view): each component card has an icon-only copy control (overlapping-rectangles icon, no border/label) that copies type-specific content to the clipboard, then calls `mark_component_implemented` (DB `now()` for `implemented_at`, matching the `updated_at` trigger â†’ status becomes **×”×•×˜×ž×¢**, not ×¢×‘×¨ ×©×™× ×•×™) **only when the component is not already ×”×•×˜×ž×¢** â€” if it is already green, copy is clipboard-only (no DB write / save spinner). Payload by type: `text` â†’ rich clipboard (`text/html` from `props.html` + plain-text fallback; legacy `markdown` resolved to HTML first); `banner` â†’ image URL; `video` â†’ video URL; `question` â†’ prompt text. Question blocks also expose an in-body copy control beside the prompt (visual left in RTL) that copies the prompt; answer rows get a per-option copy control that copies that option's text â€” both use the same mark-if-needed rule.

Clicking the status control (larger badge with swap-arrows icon) cycles `×œ× ×”×•×˜×ž×¢` â†’ `×”×•×˜×ž×¢` â†’ `×¢×‘×¨ ×©×™× ×•×™` â†’ â€¦ via `setComponentStatus()` (`implemented_at` null / RPC now / past-relative-to-`updated_at`).

- Per-component status is derived **client-side** (`componentStatus()` in `types.ts`, same logic as the `component_status` view) since components are already loaded.
- Page/section rollups ("3/5 ×”×•×˜×ž×¢×•") come from the `page_status` / `section_status` DB views (`getStatusRollups()`), refreshed after any status-affecting change. Shown in **implement** mode only (sidebar counts + page header line). Client normalizes `total_count` as the sum of status buckets so empty pages (no components) never show a phantom `0/1` from a LEFT JOIN `count(*)`. In implement sidebar, a page whose rollup is fully complete (`implemented_count === total_count` and `total_count > 0`) gets a green row tint (`bg-emerald-50` / `text-emerald-900`, matching implemented component headers); selection still uses the blue pill.

## Page Workflow Status

Page authoring readiness is stored in `pages.workflow_status` and is separate from component implementation status:

- `in_progress` â†’ **×‘×¢×‘×•×“×”**
- `ready_for_implementation` â†’ **×ž×•×›×Ÿ ×œ×”×˜×ž×¢×”**

The edit page header exposes a two-state swap control. The edit lesson overview exposes the same working/ready control for the whole lesson: the lesson is shown as ready only when all its pages are ready, and toggling it updates every page in that lesson together (the control is disabled for an empty lesson). New home/lesson/duplicated pages start `in_progress`. Migration [`supabase/migrations/005_page_workflow_status.sql`](../supabase/migrations/005_page_workflow_status.sql) backfills existing pages as `ready_for_implementation` so applying the migration does not unexpectedly remove existing implementer access.

In implement mode, `in_progress` pages remain visible in the sidebar at low opacity but are disabled and their content cannot be opened. A preserved deep link to one shows an unavailable message instead of page content. Default selection and previous/next navigation skip in-progress pages. When **every** page in a lesson is not `ready_for_implementation` (including empty lessons), the lesson row itself is faded, forced closed, and fully disabled: its title and expand/collapse control cannot be used, and its overview cannot be opened. A preserved `?section=` deep link shows an unavailable message. Review mode continues to show all pages.

## UI / RTL

- Content is `dir="rtl" lang="he"` below the shared `PageLayout` top nav (Hebrew hub header when locale is `he`). Tailwind logical properties (`ms-`/`me-`/`ps-`/`pe-`/`border-s/e`) throughout. Hub nav trail: `×¤×™×ª×•×— ×§×•×¨×¡×™× / ×›×œ ×”×§×•×¨×¡×™×` on the courses list; on a course shell also `/ {course title}`, with **×›×œ ×”×§×•×¨×¡×™×** linking to `/`.
- **Chrome colors**: sidebar `bg-[#F8F9FA]` at `w-80` (no divider border toward the main pane), main canvas `bg-white`. Component cards use a stronger `border-2` outline in both modes: `border-surface-200` in edit; in implement the outer border is status-colored (`statusBorderClass`: emerald-400 / amber-400 / surface-400) and the header uses a matching status tint (`statusHeaderClass`). Sidebar row hovers use `bg-white` so they still contrast on the tinted sidebar. Mode toggle: selected segment `bg-black text-white`; unchosen segments `bg-white text-surface-600`.
- **Fixed split panes**: `CourseShell` locks to `h-[calc(100vh-3rem)]` (viewport minus `PageLayout` `h-12` nav) with `overflow-hidden`. Sidebar and main each scroll independently â€” main content scroll does not move the sidebar; a long section/page list scrolls inside the sidebar `nav` only. Sidebar `nav` uses `scrollbar-rounded` (default surface thumb colors, 3px radius) from `@workspace/ui` globals.
- **Sidebar (right side, per RTL)**: header is course title (`text-xl`) on the right with mode toggle top-left (labels: ×¢×¨×™×›×” / ×”×˜×ž×¢×” / ×ª×¦×•×’×”; unchosen options white bg), then a full-width last-updated row under them (`×¢×•×“×›×Ÿ ×œ××—×¨×•× ×” ×‘{he-IL date}` from `course.updated_at`). Back to all courses is only in the hub nav trail (`×›×œ ×”×§×•×¨×¡×™×`), not the sidebar. Nav text is one step larger than default body (`text-base` sections/pages, `text-sm` meta/actions). Below: **×¢×ž×•×“ ×¨××©×™** (course home page, title-only, no numbering) above the collapsible section list (section title only â€” no section index) with pages nested as `1.1 | ×›×•×ª×¨×ª` (number inherits the rowâ€™s size / color, `|` separator). **Lesson title click** opens the lesson overview (`?section=<id>`, clears `page`); expands the section if collapsed. **Chevron** only expands/collapses. Selected lesson uses the same blue pill as a selected page. When `opens_at` is set, a dark-grey subtitle under the title shows a lock icon + `פתיחת שיעור: {he-IL date}` (white/80 when selected). Creating a lesson page also creates an empty **banner** component at position 0; existing pages and the course home page are unchanged. Edit mode: page and lesson (section) rows get a hover â‹® menu â€” pages: rename / duplicate / delete (home: rename only); lessons: rename / duplicate / delete. Page duplicate inserts immediately under the source titled `×”×¢×ª×§ ×©×œ {title}`, clones component types and order with empty props except **banner** props are copied; page notes are not copied. Section duplicate inserts immediately under the source titled `×”×¢×ª×§ ×©×œ {title}`, copies lesson overview fields (`opens_at`, `assignments_due_at`, `files_folder_url`), and clones each page with the same titles/order and the same component-copy rules. **Implement mode only**: each lesson page row shows a type logo on the right of the page number (before `1.1 |` in DOM / visual right in RTL); the home page ("×¢×ž×•×“ ×¨××©×™") has no type icon. Derived from that pageâ€™s blocks via `derivePageType` / `getPageTypes` â€” any `question` â†’ H5P (`/h5p-logo.svg`); otherwise a normal page (`/page-logo.svg`). Tooltip is the Hebrew/English type label. Monochrome page logo inverts to white when the row is selected. Current page highlighted as an inset pill (`mx-2 rounded-lg bg-[#0F6CBF]` with white text â€” not full-bleed). In implement mode, fully implemented pages (all components ×”×•×˜×ž×¢×•) use `bg-emerald-50` when not selected. Edit mode: hover-revealed drag handle / rename / delete per lesson page row (home page: rename only, no delete/drag), "+ ×¢×ž×•×“ ×—×“×©" under each section (indented to align with page numbers, accounting for the grip slot), "+ ×©×™×¢×•×¨ ×—×“×©" at the bottom (aligned under sections with grip-slot indent only â€” slightly right of section titles). All hidden in implement and preview modes.
- **Main content**: when `?section=` is set, main shows **`SectionOverview`** (lesson title + ×œ×™× ×§ ×œ×ª×™×§×™×™×ª ×§×‘×¦×™× + ×ª××¨×™×š ×¤×ª×™×—×” + ×ª××¨×™×š ××—×¨×•×Ÿ ×œ×”×’×©×ª ×ž×˜×œ×•×ª/×ª×¨×’×™×œ×™×). Edit: debounced fields; implement/preview: read-only, omit empty fields (empty overview shows â€œ××™×Ÿ ×¢×“×™×™×Ÿ ×ž×™×“×¢ ×¢×œ ×”×©×™×¢×•×¨â€). Below the settings, a Moodle-style collapsible topic card lists the lesson pages (type logo, `1.1 | title` blue link, and a "מוסתר מהטמעה" badge for in-progress pages; those rows are dimmed/disabled in implement). Otherwise page column is `max-w-3xl` with extra start padding (`ps-12`) so comment icons sit in a gutter **outside** the content alignment (visual right / toward the sidebar); blocks and page header share the same left/right edges. Page header matches sidebar page rows â€” `1.1 | ×›×•×ª×¨×ª` for lesson pages; home page shows title only (no number/`|`); title is inline-editable in edit mode (`text-3xl`). In implement mode, a page-level StatusBadge on the visual-left of the title row cycles status for all blocks on the page (same cycle as per-block; mixed pages show the least-progressed status). **Page notes** (`PageNotes`, edit only): same gutter speech-bubble pattern as block comments, aligned to the page title row â€” closed icon to the right of the title; open panel labeled "×”×¢×¨×•×ª ×œ×”×˜×ž×¢×”" with a resizable textarea (debounced save). Blue dot badge when notes are non-empty; low opacity when empty. Mutually exclusive with open block-comment threads. In implement, label above notes with no box/border and red (`text-danger`) body when non-empty; **hidden in preview**. Per-component `props.notes` are **not** editable in edit mode (no ×”×¢×¨×•×ª input on banner/video/question); if already set in jsonb, shown under the component body in implement when non-empty (same red style); **hidden in preview**. Edit/implement: stacked component cards (drag handle + duplicate + delete in edit; in implement the full card header is tinted to the status color with a larger clickable status control â€” swap-arrows icon + label â€” that cycles + icon-only copy). Preview: blocks stacked without cards/headers. **Block comments** (`BlockComments`): when closed, speech-bubble icon absolutely positioned just past the blockâ€™s right edge (outside the column); when open, the thread panel aligns to the **top of the block** and the icon (+ unresolved badge) moves into the panel header next to "×”×¢×¨×•×ª". Low opacity when empty, full + count badge when unresolved > 0, medium opacity with no number when all resolved. Click toggles the panel (one open at a time, including page notes); composer adds a comment under the current viewâ€™s role. Per-comment ×¡×ž×Ÿ ×›× ×¤×ª×¨ / ×¤×ª×— ×ž×—×“×©; delete (trash) only when current mode matches the commentâ€™s author_role. Dashed add-component box with 4 type buttons (edit only). **Page prev/next** at the bottom of every page (all modes): hyperlink-styled controls showing adjacent page names in sidebar order (home â†’ sectionsâ€™ pages); previous on the start side with a right chevron, next on the end side with a left chevron; labels use `1.1 | title` (home: title only); omitted edge when no neighbor. Body/field text is one step larger than default (`text-base` content, `text-sm` labels). Hebrew status labels: ×”×•×˜×ž×¢ / ×œ× ×”×•×˜×ž×¢ / ×¢×‘×¨ ×©×™× ×•×™; rollup copy uses ×”×•×˜×ž×¢×• / ×¢×‘×¨×• ×©×™× ×•×™.
- Inputs keep a static `border-surface-200` with no focus border change and no global `:focus-visible` black ring (form fields are opted out in `@workspace/ui` `globals.css`).
- Block edits are debounced (700ms) and flushed on page switch. Deletes use `window.confirm`.
- **Save status**: top-left of the main page canvas (below the Hub nav, not in the header strip) shows a spinner + "×©×•×ž×¨ ×©×™× ×•×™×™×..." (`text-base`) while any DB mutation is pending (incl. debounce window), held for a **minimum of 2s**, then "×›×œ ×”×©×™× ×•×™×™× × ×©×ž×¨×•". Wired via `SaveStatusProvider` in `App.tsx`; `PageContent` / `SectionOverview` / `CourseShell` / `CoursesPage` call `trackSave` / `beginSave`/`endSave`. Implement copy skips `mark_component_implemented` (and the spinner) when the component is already **×”×•×˜×ž×¢**. Because `CourseShell` consumes the save context, every phase change re-renders it and re-creates the `onContentChange` / `onStatusChange` props it passes down; `PageContent`'s page-load effect therefore depends on `page.id` alone and reads those callbacks (plus `trackSave` / `endSave`) from a ref in its flush cleanup. Adding callback props back to that dependency array makes every save refetch the page and reset local UI state (open comment thread, header popovers).
- dnd-kit vertical sorting is axis-independent, so RTL is safe; drag activates after 5px so clicks still select.

## Notes / caveats

- No auth and no RLS â€” the anon key has full read/write. Before sharing a public Vercel URL: enable Vercel deployment protection or add RLS. Not a local-dev concern.
- Block renderers take `props` + `mode: CourseViewMode` â€” one component set for edit, implement, and preview.
- `components.props` is the only jsonb field; everything else is normalized columns.
- Course `updated_at` bumps on title/description edits (per-table trigger) and on nested content mutations via `touchCourse()` in `api.ts` (sections/pages/components add/update/delete/reorder). Implementer-only status changes (`implemented_at` / mark-as-implemented) do not bump it. Sidebar + course list read `course.updated_at`.
