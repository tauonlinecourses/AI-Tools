# Course Builder — To Do

Working checklist for post-MVP work. Spec / as-built: [course-builder-mvp-spec.md](./course-builder-mvp-spec.md).

Mark items `[x]` when done. Add new items under the right section; keep notes short.

---

## Done (MVP)

- [x] Courses list — create / delete, counts, last updated
- [x] Course shell — edit / implement / preview modes + sidebar tree
- [x] Sections & pages — CRUD, DnD reorder, Hebrew RTL chrome
- [x] Course home page ("עמוד ראשי") — ensure on create/load, rename only
- [x] Component types — banner, video, text, question
- [x] Implementation status — derived timestamps, rollups, mark / cycle status
- [x] Preview embeds — YouTube / Panopto / other via `videoEmbed.ts`
- [x] Save status indicator (שומר / נשמרו)
- [x] Page notes for implementers (hidden in preview)
- [x] Per-component notes (הערות) — banner / video / question (not text); edit inputs + implement display under each block

---

## Security & deploy

- [ ] Auth (or at least protect the app before a public URL)
- [ ] Supabase RLS — anon key currently has full read/write
- [ ] Confirm Vercel deployment protection if sharing externally

---

## Content & blocks

- [x] Rich text for text blocks (TipTap: bold / H1 / H2 / link icons; sanitized HTML in implement/preview; rich clipboard copy)
- [ ] Image / file upload for banners (today: URL only)
- [ ] Richer question types beyond `single_choice`
- [ ] Additional component types (as needed)

---

## Data & API

- [ ] Add teachers and course developer fields to course data (schema + edit UI)
- [ ] Add "available from" date + hour to sections (schema + edit UI)
- [ ] Apply pending migrations on live DB if missing (`001_course_home_page`, `002_fix_empty_page_rollup`, `mark_component_implemented`)
- [ ] Bump course `updated_at` when nested content changes (today only title/description)
- [ ] Soft-delete / undo for destructive actions (today: `window.confirm` only)

---

## Pages & sidebar

- [ ] Page types with icons — assign a type to each page and show the matching icon in the implement-view sidebar

---

## UX polish

- [ ] Course description editing in the UI (column exists; surface if needed)
- [ ] Empty states / onboarding for a brand-new course
- [ ] Keyboard / a11y pass on DnD and status controls
- [ ] Mobile layout pass (sidebar + canvas)

---

## Docs & hygiene

- [ ] Keep this file and `course-builder-mvp-spec.md` in sync after behavior changes
- [ ] Decide fate of unused `api/chat.ts` (legacy AI route)

---

## Backlog / ideas

<!-- Park future ideas here; promote to a section above when actively working. -->

- [ ] Text block: copy HTML source string (in addition to rich clipboard paste)
