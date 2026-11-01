# Course Builder â€” Project Structure

Internal workflow tool for course **builders** and **implementers** â€” not student-facing at any point. Builders design course structure and page content here; implementers use it as a reference to manually implement the course in Moodle or edX. Also includes a polished **preview** (×ª×¦×•×’×”) of the page without implementer chrome.

**Status: MVP implemented** (authoring + implement + preview, Supabase-backed). This doc reflects the implementation as built.

## Stack (as implemented)

The original spec called for Next.js; the MVP was adapted to the monorepo conventions (`agents/workspace/`):

- React + Vite SPA (port 5176), `react-router-dom` for routing
- Supabase (Postgres) via `@supabase/supabase-js` **directly from the browser** â€” no API routes needed (single-user MVP, no auth). Relational schema, no jsonb blob. RLS is enabled with open `anon`/`authenticated` policies (`006_enable_rls.sql`) so the SPA keeps working; data is still reachable with the anon key until login is added.
- `@workspace/ui` + shared Tailwind tokens (not shadcn/ui) â€” `PageLayout` chrome, Button/Card/Input/Badge/Spinner
- dnd-kit (drag-and-drop reordering of sections, pages, and components)

Env (in `apps/course-builder/.env`, see `.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Must be `VITE_`-prefixed for Vite to expose them; the anon key is public by design.

## Data Model

Applied to the live Supabase project; committed at [`supabase/schema.sql`](../supabase/schema.sql) (do not re-run the full file against the existing DB). Newer helpers such as `mark_component_implemented` should be applied once via the SQL editor if missing. Course home page support is in [`supabase/migrations/001_course_home_page.sql`](../supabase/migrations/001_course_home_page.sql) â€” apply once if the live DB still has `pages.section_id` NOT NULL. Lesson overview columns are in [`supabase/migrations/004_section_lesson_info.sql`](../supabase/migrations/004_section_lesson_info.sql); videos folder URL in [`supabase/migrations/013_section_videos_folder.sql`](../supabase/migrations/013_section_videos_folder.sql). Page readiness is in [`supabase/migrations/005_page_workflow_status.sql`](../supabase/migrations/005_page_workflow_status.sql). RLS (open `anon`/`authenticated` policies until auth) is in [`supabase/migrations/006_enable_rls.sql`](../supabase/migrations/006_enable_rls.sql). Page titles are free-form (no auto `1.1` numbering); [`supabase/migrations/014_page_number_label.sql`](../supabase/migrations/014_page_number_label.sql) drops any draft `number_label` column.

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
  videos_folder_url (text, nullable â€” ×œ×™× ×§ ×œ×ª×™×§×™×™×ª ×¡×¨×˜×•× ×™× ×©×œ ×”×©×™×¢×•×¨)
  created_at

pages
  id (uuid, pk)
  section_id (fk -> sections, cascade, nullable)
  course_id (fk -> courses, cascade, nullable)
  title
  position (int)
  notes (text, nullable â€” legacy free-text field; kept for backup/import, no longer edited in the UI)
  workflow_status (text: 'in_progress' | 'ready_for_implementation'; new pages default to in_progress)
  constraint: exactly one of section_id / course_id is set
    - lesson page: section_id set, course_id null
    - course home page ("×¢×ž×•×“ ×¨××©×™"): course_id set, section_id null (unique per course)

components
  id (uuid, pk)
  page_id (fk -> pages, cascade)
  type (text: 'banner' | 'video' | 'interactive_video' | 'text' | 'question' | 'image' | 'text_unit' | 'interactive_unit' | 'button' | 'notes_board' | 'word_cloud' | 'forum')
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

page_comments
  id (uuid, pk)
  page_id (fk -> pages, cascade)
  author_role (text: 'edit' | 'implement' | 'review' â€” view role, not a person)
  body (text)
  resolved_at (timestamptz, nullable â€” null = open)
  created_at
```

Ordering: simple integer `position`, renumbered to array index on reorder (`renumber()` in `src/lib/api.ts`).

**Comments** (Word-style): one chronological thread per component **and** one thread per page header. Migrations [`supabase/migrations/003_component_comments.sql`](../supabase/migrations/003_component_comments.sql) and [`supabase/migrations/015_page_comments.sql`](../supabase/migrations/015_page_comments.sql) â€” apply via SQL editor if the live DB does not have the tables yet. Comment mutations do **not** bump `components.updated_at`, `pages.updated_at`, or course `updated_at` (must not flip implementer status to ×¢×‘×¨ ×©×™× ×•×™). Author is the view role label (×¦×•×•×ª ×¤×™×ª×•×— ×œ×ž×™×“×” / ×¦×•×•×ª ×”×˜×ž×¢×” / ×¦×•×•×ª ×ž×¨×¦×™×), color-coded per role. Resolve is per comment; resolved comments stay visible (strikethrough + green check, no "נפתר" badge) and can be reopened via ×¤×ª×— ×ž×—×“×©. Delete (trash) is available only when the current view mode matches the commentâ€™s `author_role` (same role that published it). Icon badge (blocks + page header): blue count = unresolved; when all comments on that thread are resolved, a grey badge shows the resolved count. `BlockComments` is shared for both. Sidebar page rows count **block + page-header** comments via `getCommentCountsByPage` (open-only badge preferred; resolving decreases it).

**Course home page ("×¢×ž×•×“ ×¨××©×™" / ×“×£ ×”×‘×™×ª)**: every course gets one by default (`createCourse` + `ensureHomePage` on tree load for existing courses). It appears in the sidebar **above** the first lesson, title-only. Same component editor as other pages, except the add-component box shows only **×¨×›×™×‘×™× ×ž×¨×›×–×™×™×** (no ×¤×¢×™×œ×•×™×•×ª — activities cannot be added on the home page). Below the page components (all modes), a Moodle-style list of **all lessons** is shown via `LessonPagesCard` (same card as the lesson overview): each lesson expands to its pages (title links; in-progress pages dimmed/disabled in implement). When a lesson has `opens_at` set, a tag under the lesson title shows **זמין החל מ {he-IL date}**. Clicking a lesson title opens that lesson overview. Rename allowed; delete disabled. Not nested under a section and not included in section reorder/DnD. `ensureHomePage` tolerates a unique-index race (parallel Strict Mode loads): on insert conflict it re-fetches the existing row.

## Component Types (MVP)

| Type | Key props | UI notes |
|---|---|---|
| `banner` | imageUrl, notes | Wide 4:1 placeholder: label always `באנר - {page title}` (no custom name field); image URL fitted with `object-contain` (full image visible, letterboxed in the 4:1 frame) when set; "ללא קובץ" when no URL or the image fails to load. SharePoint `:i:` copy links are resolved via `MediaImage` (`download.aspx` → `embed.aspx` fallback) — see SharePoint media below. Click opens the original image URL in a new tab in edit/implement only — preview has no link. In edit, a link icon in the block header opens an anchored URL-field popover; there is no accordion/settings panel or placeholder chevron. No subtitle. In all modes, title overlay is hidden only when the image actually paints; if a URL is set but the image does not show (broken/blocked URL), the banner name (+ "ללא קובץ") stays visible. **Implement**: header thumbnail icon opens `imageUrl` in a new tab (disabled when empty); legacy `notes` under the block when set; preview: notes hidden. |
| `video` | title (optional display name), url, provider (auto from URL), notes | **All modes**: when `url` resolves to an embeddable src, show the iframe player (YouTube → embed URL; SharePoint → `embed.aspx` from `sharePointEmbedUrl`, never the raw copy link; Panopto/other use URL as iframe src). SharePoint embeds also show a "פתח ב-SharePoint" link under the iframe. When no embeddable URL: black aspect-video placeholder with default label `{page title} \| סרטון מספר N` (N = 1-based video index on the page; overrides to custom `title` when set), circular play icon, "ללא קובץ" when empty; click opens URL in a new tab when set. In edit, title + link icons in the block header open anchored single-field popovers (no platform picker). Platform is inferred from the URL via `detectVideoProvider` in `src/lib/videoEmbed.ts` (YouTube id / youtu.be → youtube; `*.sharepoint.com` → sharepoint; `*.panopto.com` → panopto; else other) and stored on save. **Implement**: header link icon opens `url` in a new tab (disabled when empty); legacy `notes` under the block when set; preview: notes hidden. |
| `text` | html (rich text; legacy `markdown` plain text migrated on edit) | Edit: TipTap WYSIWYG with compact single-row RTL Moodle-like toolbar — undo/redo, bold, italic, underline, text color (fixed palette), H1/H2 (body text stays normal size; no custom font-size control), link/unlink, align R/C/L, block dir RTL/LTR, bullet/ordered lists. No image/video/H5P inside the text block (use dedicated components). No per-component notes (body is the content). Implement + preview: sanitized HTML (`dompurify` allowlist: `p br strong b em i u h1–h3 a ul ol li span`; attrs `href target rel dir style` with style limited to allowed `color` / `text-align`). Implement copy: rich clipboard (`text/html` + `text/plain`; lists included in plain extraction). |
| `question` | questionType ('single_choice'), prompt, options[] ({id, text}), correctOptionId, notes | Edit: prompt + options (default 4 empty choices with the first marked correct; larger correct-answer radio/checkbox; no ×”×¢×¨×•×ª input). **Ready-status guard (edit only)**: when setting page workflow to מוכן להטמעה, `validatePageQuestions` checks every `question` and interactive-video embedded question — no empty option texts, and at least one selected correct answer (`yes_no` only needs a correct choice). On failure, `alert` lists the issues and the status change is blocked. Implement: copy icon beside the prompt (visual left in RTL) copies the prompt; each option row has a copy icon that copies that option's text (clipboard only — does not change status); clicking either copy control briefly shows **הועתק** in place of the icon (~2s); legacy `notes` under the block when set. Preview: same read-only options, no copy controls / notes. |

| `button` | text, align (`left` | `center` | `right`), url | Content button. Edit: pencil + align + link icons in the card header open popovers for label, ימין/מרכז/שמאל, and URL; body is the aligned primary-button preview. When `url` is set, the button is clickable in all modes (opens in a new tab); without a URL it is display-only. Default align `center`; empty text shows placeholder label "כפתור". **Implement**: header link icon opens `url` in a new tab (disabled when empty). |
| `image` | imageUrl, notes | Aspect-video block. Displays the image when `imageUrl` is set (SharePoint `:i:` copy links via `MediaImage` — see SharePoint media below); in edit/implement, clicking it opens the original `imageUrl` in a new tab. When no image URL or image fails to load: black placeholder like video with label `{page title} \| תמונה מספר N` (N = 1-based image index on the page) and "ללא קובץ" when empty. Edit: header popover for image URL only (no separate file link). **Implement**: header thumbnail icon opens `imageUrl` in a new tab (disabled when empty); legacy `notes` under block when set. Preview: image display only, notes hidden. |
| `text_unit` | imageUrl, fileUrl, notes | Content block "יחידת טקסט". When `imageUrl` loads: aspect-video image (SharePoint via `MediaImage`); click opens `fileUrl` when set. Without a working image: black placeholder like תמונה with label `{page title} \| יחידת טקסט מספר N` plus "ללא תמונה" and/or "ללא קובץ" when those URLs are missing. Image without file shows a "ללא קובץ" overlay. Edit: header popovers for image URL + file URL. **Implement**: open-URL icons on the far left (no copy); legacy `notes` under block when set; preview: notes hidden. |
| `interactive_unit` | imageUrl, fileUrl, notes | Content block "יחידה אינטראקטיבית". Same behavior as `text_unit` (shared `TextUnitBlock`); label uses `יחידה אינטראקטיבית מספר N`; distinct type/icon in the picker and overview. |
| `notes_board` | description, columns[] | Activity (pinned bottom). Kanban-style 3-column placeholder. Uses `/notes-board-logo.svg` in edit card header + implement sidebar page type. |
| `word_cloud` | centerWord | Activity (pinned bottom). Sample word-cloud mock + optional center word. Uses `/cloud-words-logo.svg` in edit card header + implement sidebar. |
| `forum` | title (default פורום) | Activity (pinned bottom). Sample discussion-list placeholder only (no title box in the block body). Uses `/forum-icon.svg` in edit card header + implement sidebar. |

**Activities** (`question`, `notes_board`, `word_cloud`, `forum`): only one activity *kind* per page (`ACTIVITY_TYPES`). Within that kind, `question` may appear multiple times; `notes_board` / `word_cloud` / `forum` are singletons (`SINGLETON_ACTIVITY_TYPES` — add and duplicate both blocked). Those three are always pinned to the bottom (`PINNED_BOTTOM_TYPES`). `derivePageType` maps forum → forum, notes_board → notes_board, word_cloud → word_cloud, question/interactive_video → h5p, else page.

Banner, video, question, image, text_unit, and interactive_unit may still carry optional `props.notes` in jsonb (legacy). **No edit-mode ×”×¢×¨×•×ª input** on blocks â€” use page-header comments and/or block comments instead. When non-empty, legacy block `notes` are still shown under the component in implement (label + red `text-danger` body); **hidden in preview**. Text blocks never had a notes field. The old edit-only page notes panel (`pages.notes`) was replaced by multi-role page-header comments.

TypeScript interfaces: `src/lib/types.ts` (`CourseViewMode = "edit" | "implement" | "review"`, `NotesProps` on every block props type, `PageType` / `derivePageType` for implement sidebar logos, `ThreadComment` / `ComponentComment` / `PageComment` / `CommentAuthorRole` + Hebrew labels and role colors).

## App Structure (actual files)

```
apps/course-builder/
  supabase/schema.sql            â†’ committed copy of the applied DB schema
  supabase/migrations/           â†’ incremental SQL (001 home page, 002 empty rollup, 003 component_comments, â€¦, 015 page_comments)
  api/chat.ts                    â†’ legacy AI route (kept; unused by MVP)
  src/
    App.tsx                      â†’ BrowserRouter + routes
    lib/
      supabase.ts                â†’ supabase-js client (VITE_SUPABASE_* env)
      types.ts                   â†’ entities, block props, CourseViewMode, comments, status derivation
      videoEmbed.ts              → resolve YouTube/SharePoint/Panopto/other iframe src for preview
      sharePoint.ts              → parse SharePoint copy links → GUID; build embed.aspx / download.aspx URLs
      questionValidation.ts      → ready-status checks for empty options / missing correct answer
      textHtml.ts                → sanitize / resolve text HTML (expanded marks/lists/style allowlist), plain-text extraction
      textDirection.ts           → TipTap extension: `dir` rtl/ltr on paragraph/heading/lists
      clipboard.ts               â†’ writeClipboard (rich HTML + plain, with fallback)
      api.ts                     â†’ CRUD, reorder/renumber, duplicatePage / duplicateSection / duplicateComponent, rollups, getPageTypes, getCourseOverviewData, comments (+ getCommentCountsByPage for sidebar unresolved counts), setComponentStatus / markImplemented, touchCourse
      courseOverviewStats.ts     â†’ pure aggregation for course overview (counts, averages, page/component types, workflow, implement rollup)
      courseBackup.ts            â†’ local `.coursebuilder.json` backup: build / parse / import (new course) / download
      saveStatus.tsx             â†’ SaveStatusProvider + Hebrew nav indicator (×©×•×ž×¨ / × ×©×ž×¨×•)
    pages/
      CoursesPage.tsx            â†’ course list (counts, last updated) + create/delete + ייבא גיבוי; eye â†’ /review
    components/
      CourseShell.tsx            â†’ shared layout (sidebar + main) for all three modes; שמור גיבוי in sidebar header; `?view=overview` course analytics
      CourseOverview.tsx         â†’ course-level stats + recharts (page types, workflow, implement progress, component types)
      PageContent.tsx            â†’ page header + page-header comments, component list, add picker, comment loading; home page also lists all lessons via LessonPagesCard
      SectionOverview.tsx        → lesson overview (settings + LessonPagesCard)
      LessonPagesCard.tsx        → shared Moodle-style collapsible lesson → pages list; optional `opensAt` tag ("זמין החל מ") under title on home page
      BlockComments.tsx          â†’ gutter comment icon + Word-style thread panel (blocks + page header, all modes)
      SortableList.tsx           â†’ generic dnd-kit vertical sortable wrapper
      StatusBadge.tsx            â†’ implemented / needs_update / not_implemented badge (implement: larger clickable control with swap arrows; click cycles not_implemented ↔ implemented only; needs_update is display/auto only)
      icons.tsx                  â†’ monochrome SVG icons (default size via className default `w-4 h-4`; pass size override to replace, never stack conflicting Tailwind width/height utilities)
      blocks/
        BlockRenderer.tsx        â†’ switch on type; single component set for all modes
        BannerBlock.tsx, VideoBlock.tsx, TextBlock.tsx, QuestionBlock.tsx, ThumbnailBlock.tsx (image),
        TextUnitBlock.tsx (יחידת טקסט / יחידה אינטראקטיבית), ButtonBlock.tsx,
        NotesBoardBlock.tsx, WordCloudBlock.tsx, ForumBlock.tsx, InteractiveVideoBlock.tsx,
        MediaImage.tsx           → shared image renderer (SharePoint download.aspx → embed.aspx fallback)
        fields.tsx               → shared labeled field primitives
```

### SharePoint media

Users paste SharePoint / OneDrive "Copy link" URLs (`/:v:/…` videos, `/:i:/…` images) into video / banner / image blocks. Raw share links refuse framing, so `sharePoint.ts` resolves a file GUID and builds embed/download URLs:

- **Site/team token links** (`/:k:/s/Site/IQtoken`, `/:k:/t/Team/…`): decode the undocumented base64url token (only the `0x21` / "IQ…" format).
- **Path-based / OneDrive personal** (`/:k:/r/personal|sites|teams/…/file?d=w{guid}`): read the GUID from the `d=` query param; site path is `/personal/…`, `/sites/…`, or `/teams/…`.
- **Stream address-bar links** (`/personal|sites|teams/…/_layouts/15/stream.aspx?id=/path/to/file.mp4`): convert to `embed.aspx?id=` using the file path. Do **not** use `referrerScenario=AddressBarCopied.view.{guid}` as UniqueId (that GUID is a view/session id and yields SharePoint "File Not Found"). Also accepts already-embeddable `embed.aspx?UniqueId=`.

Then:

- Videos (preview): `…/_layouts/15/embed.aspx?UniqueId={guid}` as the iframe `src`, plus a "פתח ב-SharePoint" link to the original URL.
- Images (all modes): try `download.aspx?UniqueId=` in `<img>`; on failure fall back to `embed.aspx` in an iframe; if both fail, show the usual empty placeholder (click-through still uses the original URL in edit/implement).

**Caveats:** viewers must be signed in to the TAU Microsoft account in the same browser; Safari/Firefox often block or partition third-party cookies so embeds may show a sign-in screen or fail (use the open-in-SharePoint / original link). Only `:v:` and `:i:` are supported for display (PDFs / Office fall back to a plain link). Token format for IQ links is undocumented — unsupported tokens return null and never get a broken iframe.

### Routes

| Route | Purpose |
|---|---|
| `/` | Home â€” list of courses (name, section count, page count, last updated) + create/delete + import backup |
| `/courses/:courseId` | Redirects to `/edit` |
| `/courses/:courseId/edit` | Editor (`CourseShell mode="edit"`); `?page=` / `?section=` / `?view=overview` selection |
| `/courses/:courseId/implement` | Implementer view (`mode="implement"`) â€” read-only cards + status/copy/notes; lesson overview via `?section=`; course overview via `?view=overview` |
| `/courses/:courseId/review` | Polished preview (`mode="review"` / ×ª×¦×•×’×”) â€” no cards/notes/status; video embeds; comments available; lesson overview via `?section=`; course overview via `?view=overview` |

Selected page is a `?page=<pageId>` search param; lesson overview is `?section=<id>`; course overview is `?view=overview`. Selection priority: `section` > `view=overview` > `page` > default home page. Params are preserved when toggling modes. Opening a course without params still lands on the home page (overview is opt-in via sidebar). Deep links work on Vercel via the SPA rewrite in `vercel.json` (`/((?!api/).*)` â†’ `/index.html`).

### Mode matrix

| | Edit (×¢×¨×™×›×”) | Implement (×”×˜×ž×¢×”) | Preview (×ª×¦×•×’×”) |
|---|---|---|---|
| Sidebar CRUD / DnD | yes | no | no |
| Page readiness toggle | yes | no (in-progress pages are disabled) | no |
| Status rollups | no | yes | no |
| Notes (per component, legacy) | not edited in UI | red read-only under block when set | hidden |
| Component cards / headers | yes | yes + status + copy | no â€” plain stacked blocks |
| Block comments | yes (author: ×¦×•×•×ª ×¤×™×ª×•×— ×œ×ž×™×“×”) | yes (author: ×¦×•×•×ª ×”×˜×ž×¢×”) | yes (author: ×¦×•×•×ª ×ž×¨×¦×™×) |
| Page-header comments | yes (author: ×¦×•×•×ª ×¤×™×ª×•×— ×œ×ž×™×“×”) | yes (author: ×¦×•×•×ª ×”×˜×ž×¢×”) | yes (author: ×¦×•×•×ª ×ž×¨×¦×™×) |
| Video | iframe embed when URL resolves (else placeholder) | iframe embed when URL resolves (else placeholder + link-out) | iframe embed when URL resolves (SharePoint → embed.aspx + פתח ב-SharePoint) |

## Implementation Status Tracking

Status is **derived from timestamps**, not stored:

- `implemented_at is null` â†’ **not_implemented**
- `implemented_at < updated_at` â†’ **needs_update** (edited since last implementation; reordering also bumps `updated_at` by design)
- `implemented_at >= updated_at` â†’ **implemented**

Implement view copy: each component card that is **not** a media/link block (`banner`, `video` / `interactive_video`, `image`, `text_unit`, `interactive_unit`, `button`) has an icon-only copy control that copies type-specific content to the clipboard **only** — it does **not** auto-mark the component implemented. Those media/link blocks instead show open-URL icon(s) on the far visual-left of the header (to the left of the status badge). After a successful header copy the icon briefly swaps to **הועתק** (~2s). Status is changed manually via the status badge / page-level status control (`setComponentStatus` / `mark_component_implemented`). Payload by type: `text` → rich clipboard (`text/html` from `props.html` + plain-text fallback; legacy `markdown` resolved to HTML first); `question` → prompt text. Question blocks also expose an in-body copy control beside the prompt (visual left in RTL) that copies the prompt; answer rows get a per-option copy control that copies that option's text â€” clipboard only, same as the header copy.

Clicking the status control (larger badge with swap-arrows icon) cycles **manually** only between `×œ× ×”×•×˜×ž×¢` â†’ `×”×•×˜×ž×¢` â†’ â€¦ via `setComponentStatus()` (`implemented_at` null / RPC now). **`×¢×‘×¨ ×©×™× ×•×™` is never a manual target** — it appears automatically when content edits bump `updated_at` past `implemented_at`. Clicking the control while a block is `needs_update` marks it `implemented` again.

- Per-component status is derived **client-side** (`componentStatus()` in `types.ts`, same logic as the `component_status` view) since components are already loaded.
- Page/section rollups ("3/5 ×”×•×˜×ž×¢×•") come from the `page_status` / `section_status` DB views (`getStatusRollups()`), refreshed after any status-affecting change. Shown in **implement** mode only (sidebar counts + page header line). Client normalizes `total_count` as the sum of status buckets so empty pages (no components) never show a phantom `0/1` from a LEFT JOIN `count(*)`. In implement sidebar, a page whose rollup is fully complete (`implemented_count === total_count` and `total_count > 0`) gets a green row tint (`bg-emerald-50` / `text-emerald-900`, matching implemented component headers); selection still uses the blue pill.

## Page Workflow Status

Page authoring readiness is stored in `pages.workflow_status` and is separate from component implementation status:

- `in_progress` â†’ **×‘×¢×‘×•×“×”**
- `ready_for_implementation` â†’ **×ž×•×›×Ÿ ×œ×”×˜×ž×¢×”**

The edit page header exposes a two-option segmented toggle (בעבודה / מוכן להטמעה) that always shows both statuses: the selected option keeps its status color (amber / emerald) with a sliding pill animation on change. The edit lesson overview exposes the same segmented control for the whole lesson: the lesson is shown as ready only when all its pages are ready, and selecting the other option updates every page in that lesson together after a `window.confirm` asking whether to change all lesson pages to the target status (the control is disabled for an empty lesson). In the edit sidebar, each page row shows a small low-opacity color circle on the visual right (after the drag handle, before the page number/title): amber for `in_progress` and emerald for `ready_for_implementation`. The row background itself is unchanged by workflow status. Lesson rows use the same circle indicator (after the drag handle, before the expand chevron): emerald when every page is ready, amber when at least one page is in progress (empty lessons count as in progress). New home/lesson/duplicated pages start `in_progress`. Migration [`supabase/migrations/005_page_workflow_status.sql`](../supabase/migrations/005_page_workflow_status.sql) backfills existing pages as `ready_for_implementation` so applying the migration does not unexpectedly remove existing implementer access.

In implement mode, `in_progress` pages remain visible in the sidebar at low opacity but are disabled and their content cannot be opened. A preserved deep link to one shows an unavailable message instead of page content. Default selection and previous/next navigation skip in-progress pages. When **every** page in a lesson is not `ready_for_implementation` (including empty lessons), the lesson row itself is faded, forced closed, and fully disabled: its title and expand/collapse control cannot be used, and its overview cannot be opened. A preserved `?section=` deep link shows an unavailable message. Review mode continues to show all pages.

## UI / RTL

- Content is `dir="rtl" lang="he"` below the shared `PageLayout` top nav (Hebrew hub header when locale is `he`). Tailwind logical properties (`ms-`/`me-`/`ps-`/`pe-`/`border-s/e`) throughout. Hub nav trail: `×¤×™×ª×•×— ×§×•×¨×¡×™× / ×›×œ ×”×§×•×¨×¡×™×` on the courses list; on a course shell also `/ {course title}`, with **×›×œ ×”×§×•×¨×¡×™×** linking to `/`.
- **Chrome colors**: sidebar `bg-[#F8F9FA]` at `w-80` (no divider border toward the main pane), main canvas `bg-white`. Component cards use a stronger `border-2` outline in both modes: `border-surface-200` in edit; in implement the outer border is status-colored (`statusBorderClass`: emerald-400 / amber-400 / surface-400) and the header uses a matching status tint (`statusHeaderClass`). Sidebar row hovers use `bg-white` so they still contrast on the tinted sidebar. Mode toggle: selected segment `bg-black text-white`; unchosen segments `bg-white text-surface-600`.
- **Fixed split panes**: `CourseShell` locks to `h-[calc(100vh-3rem)]` (viewport minus `PageLayout` `h-12` nav) with `overflow-hidden`. Sidebar and main each scroll independently â€” main content scroll does not move the sidebar; a long section/page list scrolls inside the sidebar `nav` only. Sidebar `nav` uses `scrollbar-rounded` (default surface thumb colors, 3px radius) from `@workspace/ui` globals.
- **Sidebar (right side, per RTL)**: header is course title (`text-xl`) on the right with mode toggle top-left (labels: ×¢×¨×™×›×” / ×”×˜×ž×¢×” / ×ª×¦×•×’×”; unchosen options white bg), then a full-width last-updated row under them (`×¢×•×“×›×Ÿ ×œ××—×¨×•× ×” ×‘{he-IL date}` from `course.updated_at`), then **שמור גיבוי** (all modes; downloads `.coursebuilder.json`). Back to all courses is only in the hub nav trail (`×›×œ ×”×§×•×¨×¡×™×`), not the sidebar. Nav text is one step larger than default body (`text-base` sections/pages, `text-sm` meta/actions). Below: **סקירת קורס** (`?view=overview`, pie-chart icon; all modes) above **×¢×ž×•×“ ×¨××©×™** (course home page, title-only) above the collapsible section list (section title only â€” no section index) with pages nested by title only (no auto 1.1 prefix — include a number in the title if needed). **Lesson title click** opens the lesson overview (`?section=<id>`, clears `page`); expands the section if collapsed. **Chevron** only expands/collapses. Selected lesson uses the same blue pill as a selected page. Each lesson row always shows three meta icons (calendar / files folder / videos clapperboard): set values use muted grey (white/85 when selected); missing `opens_at` / `files_folder_url` / `videos_folder_url` show the matching icon in soft red (`text-danger` at 50% opacity, or light pink `#FFB4B4` on the selected blue pill). When `opens_at` is set, a dark-grey subtitle under the title shows a lock icon + `פתיחת שיעור: {he-IL date}` (white/80 when selected). Creating a lesson page also creates an empty **banner** component at position 0; existing pages and the course home page are unchanged. Edit mode: page and lesson (section) rows get a hover â‹® menu â€” pages: rename / duplicate / delete (home: rename only); lessons: rename / duplicate / delete. Page duplicate inserts immediately under the source titled `×”×¢×ª×§ ×©×œ {title}`, clones component types and order with empty props except **banner** props are copied; page-header comments are not copied. Section duplicate inserts immediately under the source titled `×”×¢×ª×§ ×©×œ {title}`, copies lesson overview fields (`opens_at`, `assignments_due_at`, `files_folder_url`, `videos_folder_url`), and clones each page with the same titles/order and the same component-copy rules. **Page comment counts** (all modes): each page row with unresolved comments shows a small **blue** circle badge after the title (open count only, capped at `99+`). Resolved-only pages show no sidebar badge. Grey resolved badges appear only on per-component comment icons. Loaded via `getCommentCountsByPage`; refreshed on tree load and after add/delete/resolve/reopen (`PageContent.onCommentsChange`). **Implement mode only**: each lesson page row shows a type logo on the right of the page number (before `1.1 |` in DOM / visual right in RTL); the home page ("×¢×ž×•×“ ×¨××©×™") has no type icon. Derived from that pageâ€™s blocks via `derivePageType` / `getPageTypes` â€” any `question` â†’ H5P (`/h5p-logo.svg`); otherwise a normal page (`/page-logo.svg`). Tooltip is the Hebrew/English type label. Monochrome page logo inverts to white when the row is selected. Current page highlighted as an inset pill (`mx-2 rounded-lg bg-[#0F6CBF]` with white text â€” not full-bleed). In implement mode, fully implemented pages (all components ×”×•×˜×ž×¢×•) use `bg-emerald-50` when not selected. Edit mode: hover-revealed drag handle / rename / delete per lesson page row (home page: rename only, no delete/drag), "+ ×¢×ž×•×“ ×—×“×©" under each section (indented to align with page numbers, accounting for the grip slot), "+ ×©×™×¢×•×¨ ×—×“×©" at the bottom (aligned under sections with grip-slot indent only â€” slightly right of section titles). All hidden in implement and preview modes.
- **Main content**: when `?view=overview` is set (and no `?section=`), main shows **`CourseOverview`** — course title + subtitle "סקירת מבנה והתקדמות"; stat tiles (lessons, pages excl. home, components, avg pages/lesson, avg components/page); interactive Recharts: page-type donut, workflow donut (בעבודה / מוכן להטמעה), implement status bar (הוטמע / עבר שינוי / לא הוטמע), horizontal component-type bar. Data via `getCourseOverviewData` (components `page_id,type` + `page_status` rollups). Accent colors from design tokens. When `?section=` is set, main shows **`SectionOverview`** (lesson title + files folder + videos folder + open date + assignments due date). Edit: debounced fields; implement/preview: read-only, omit empty fields (empty overview shows â€œ××™×Ÿ ×¢×“×™×™×Ÿ ×ž×™×“×¢ ×¢×œ ×”×©×™×¢×•×¨â€). Lesson page headers always show icon-only folder buttons (`FolderIcon` / `FilmIcon`; labels via `title`/`aria-label`: קבצי השיעור / סרטוני השיעור) in all modes. When `files_folder_url` / `videos_folder_url` are set they open the URL in a new tab; when missing they render disabled (`showDisabled`, muted + `cursor-not-allowed`, tooltip אין תיקיית קבצים/סרטונים לשיעור). The same enabled icon buttons also appear on the lesson overview in implement mode when URLs exist; edit/review lesson overview still show the labeled URL links. Below the settings, a Moodle-style collapsible topic card lists the lesson pages (type logo, title blue link, and a "מוסתר מהטמעה" badge for in-progress pages; those rows are dimmed/disabled in implement). Otherwise page column is `max-w-3xl` with extra start padding (`ps-12`) so comment icons sit in a gutter **outside** the content alignment (visual right / toward the sidebar); blocks and page header share the same left/right edges. Page header (title + workflow/implement status controls, with multi-role page-header comments via `BlockComments` in all modes) is **`sticky top-0 z-30`** in edit and implement only (not תצוגה / review) inside the main `overflow-y-auto` pane so it stays visible while scrolling (`bg-white`, `-mt-6 pt-6`, and `-ms-12 ps-12` so the white bg bleeds into the comment gutter and covers scrolling block-comment icons). Page header shows the page title only (no auto number prefix); home and lesson pages share the same title treatment; title is inline-editable in edit mode (`text-3xl`). In implement mode, a page-level StatusBadge on the visual-left of the title row cycles status for all blocks on the page after a `window.confirm` asking whether to change every component on the page to the target status (same cycle as per-block; mixed pages show the least-progressed status). **Page notes** (`PageNotes`, edit only): same gutter speech-bubble pattern as block comments, aligned to the page title row â€” closed icon to the right of the title; open panel labeled "×”×¢×¨×•×ª ×œ×”×˜×ž×¢×”" with a resizable textarea (debounced save). Blue dot badge when notes are non-empty; low opacity when empty. Mutually exclusive with open block-comment threads. Clicking outside the open panel closes it. In implement, label above notes with no box/border and red (`text-danger`) body when non-empty; **hidden in preview**. Per-component `props.notes` are **not** editable in edit mode (no ×”×¢×¨×•×ª input on banner/video/question); if already set in jsonb, shown under the component body in implement when non-empty (same red style); **hidden in preview**. Edit/implement: stacked component cards (drag handle + duplicate + delete in edit; in implement the full card header is tinted to the status color with a larger clickable status control â€” swap-arrows icon + label â€” that cycles + icon-only copy). Preview: blocks stacked without cards/headers. **Block comments** (`BlockComments`): when closed, speech-bubble icon absolutely positioned just past the blockâ€™s right edge (outside the column); when open, the thread panel aligns to the **top of the block** and the icon (+ unresolved badge) moves into the panel header next to "×”×¢×¨×•×ª". Low opacity when empty, full + count badge when unresolved > 0, medium opacity with no number when all resolved. Click toggles the panel (one open at a time, including page notes); clicking outside the open panel closes it; composer adds a comment under the current viewâ€™s role. Per-comment ×¡×ž×Ÿ ×›× ×¤×ª×¨ / ×¤×ª×— ×ž×—×“×©; delete (trash) only when current mode matches the commentâ€™s author_role. Dashed add-component box (edit only): light-blue `#F0F5FA` panel with a centered circular `+` on the top border, two centered section headers, and a 4-column tile grid (icon-in-blue-well + label). Groups: **רכיבי תוכן** (banner / video / text / image — stroke icons) and **פעילויות** (question / notes_board / word_cloud / forum — same `PAGE_TYPE_LOGO` assets as the implement sidebar: H5P / notes-board / word-cloud / forum). When the page already has an activity, a lock icon + "כבר יש פעילות בעמוד. ניתן להוסיף רק סוג פעילות אחד בעמוד" appears next to the activities header and blocked tiles are grayed/disabled (questions stay enabled if that is the existing kind). On the course home page, only **רכיבי תוכן** is shown (no activities). Adding a second distinct activity type, or a second notes_board/word_cloud/forum, is also blocked with an alert; duplicate of those singletons is also blocked. Multiple `question` blocks are allowed. **Page prev/next** at the bottom of every page (all modes): hyperlink-styled controls showing adjacent page names in sidebar order (home â†’ sectionsâ€™ pages); previous on the start side with a right chevron, next on the end side with a left chevron; labels use the page title; omitted edge when no neighbor. Body/field text is one step larger than default (`text-base` content, `text-sm` labels). Hebrew status labels: ×”×•×˜×ž×¢ / ×œ× ×”×•×˜×ž×¢ / ×¢×‘×¨ ×©×™× ×•×™; rollup copy uses ×”×•×˜×ž×¢×• / ×¢×‘×¨×• ×©×™× ×•×™.
- Inputs keep a static `border-surface-200` with no focus border change and no global `:focus-visible` black ring (form fields are opted out in `@workspace/ui` `globals.css`).
- Block edits are debounced (700ms) and flushed on page switch. Deletes use `window.confirm`.
- **Optimistic add/duplicate component**: `handleAdd` / `handleDuplicate` paint a client-UUID row in local state immediately, then persist that same `id` via `addComponent` / `duplicateComponent` options (skipping extra lookups when the client already has page/course/props/order). Later edits/deletes/reorder/comments `waitForInsert` so they do not race the row. On insert failure the optimistic row is rolled back; reorder failure after a successful insert keeps the block visible. Duplicate uses `propsForDuplicatedBlock` (regenerates question option ids); comments are not copied.
- **Save status**: top-left of the main page canvas (below the Hub nav, not in the header strip) shows a spinner + "×©×•×ž×¨ ×©×™× ×•×™×™×..." (`text-base`) while any DB mutation is pending (incl. debounce window), held for a **minimum of 2s**, then "×›×œ ×”×©×™× ×•×™×™× × ×©×ž×¨×•". Wired via `SaveStatusProvider` in `App.tsx`; `PageContent` / `SectionOverview` / `CourseShell` / `CoursesPage` call `trackSave` / `beginSave`/`endSave`. Implement copy is clipboard-only (no `mark_component_implemented` / save spinner). Because `CourseShell` consumes the save context, every phase change re-renders it and re-creates the `onContentChange` / `onStatusChange` props it passes down; `PageContent`'s page-load effect therefore depends on `page.id` alone and reads those callbacks (plus `trackSave` / `endSave`) from a ref in its flush cleanup. Adding callback props back to that dependency array makes every save refetch the page and reset local UI state (open comment thread, header popovers).
- dnd-kit vertical sorting is axis-independent, so RTL is safe; drag activates after 5px so clicks still select.

## Local backup (export / import)

Portable course dump as UTF-8 JSON (not ZIP — media is URL-only, no local binaries).

- **Format**: `{ format: "course-builder-backup", version: 1, exportedAt, course, sections, pages, components, comments }` with stable `tempKey`s for FK remapping. File extension: `.coursebuilder.json` (e.g. `{title}-{YYYY-MM-DD}.coursebuilder.json`).
- **Included**: course title/description; sections (incl. open/due dates, files + videos folder URLs); pages (home + lessons, legacy `notes`, `workflow_status`); components (full `props`, `implemented_at` + `updated_at` for status fidelity); block comments; page-header comments (`pageComments`, optional on older backups).
- **Excluded**: auth/groups/profiles; binary media (image/video/Drive URLs are stored as strings and must remain reachable).
- **Export**: `CourseShell` sidebar → **שמור גיבוי** → `exportCourseBackup` in `src/lib/courseBackup.ts` (assemble via `getCourseTree` + per-page components/comments → download Blob).
- **Import**: `CoursesPage` → **ייבא גיבוי** → parse/validate → `importCourseBackup` inserts a **new** course (never overwrites). New UUIDs for all rows; on partial failure the new course is deleted (cascade). Navigates to `/courses/{id}/edit`. Does **not** call `createCourse` / `ensureHomePage` (home page comes from the backup).

## Notes / caveats

- No auth. RLS is enabled, but policies still allow full CRUD for `anon` and `authenticated`, so the anon key has full read/write until login is added. Before sharing a public Vercel URL: enable Vercel deployment protection, or replace the open policies with authenticated-only access.
- Block renderers take `props` + `mode: CourseViewMode` â€” one component set for edit, implement, and preview.
- `components.props` is the only jsonb field; everything else is normalized columns.
- Course `updated_at` bumps on title/description edits (per-table trigger) and on nested content mutations via `touchCourse()` in `api.ts` (sections/pages/components add/update/delete/reorder). Implementer-only status changes (`implemented_at` / mark-as-implemented) do not bump it. Sidebar + course list read `course.updated_at`.
- Local backup restores content into a new course; it does not embed external media files.
