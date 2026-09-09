# Forum Comment Aggregator (campus IL / Open edX)

## Goal

You maintain many courses on campus IL (Open edX-based). Every 2 weeks you need
to check each course's technical-help forum for new student comments. Doing
this course-by-course is slow and easy to miss things.

This project pulls new forum activity (threads + comments) across **all**
your courses into one consolidated view, on a schedule, instead of manual
checking.

## How it works

Open edX exposes a built-in, read-only **Discussion API**
(`/api/discussion/v1/`). Any user with a staff or enrolled role on a course
can use it — no backend/admin access required, just your normal campus IL
login (username/email + password).

The flow:

1. **Log in** using your regular credentials to get a session cookie (same
   mechanism as logging in through the browser).
2. **For each course**, call the API to list discussion threads, sorted by
   most recent activity.
3. **Compare against a saved timestamp** from the last run, so only genuinely
   new threads/comments are kept.
4. **Fetch the actual comments** on any updated thread, since "new activity"
   usually means a new reply, not a new thread.
5. **Output** the consolidated new items (console for now; Notion/Slack/etc.
   later once this is confirmed working).

Every call the script makes is a `GET` request — nothing is created, edited,
or deleted. It cannot modify course content or forum data.

## Why we're testing in stages

Open edX's Discussion API response format has some fields that vary by
platform version (e.g. the "last activity" timestamp is called `updated_at`
on some instances and `modified_at` on others). Rather than guess, the plan
is:

**Stage 1 (this step): fetch and print one raw thread object from one real
course.** This confirms:
- Login actually works against campus IL's specific setup (plain
  username/password login, confirmed already).
- Your course-editor account can actually read that course's forum data
  (Discussion API access requires being staff *or* enrolled on that course —
  Studio/course-editor access doesn't automatically guarantee this).
- What the real field names look like, so the "what's new since last time"
  logic in the full script is built on facts instead of assumptions.

**Stage 2 (once Stage 1 confirms field names):** run the full multi-course
polling script (`fetch-forum-comments.mjs`), starting with just one course
in the list before adding the rest.

**Stage 3 (once Stage 2 is solid):** swap the console output for a
destination — Notion database, Slack message, or similar — and set it up
on a schedule (every 2 weeks) via a cron job / GitHub Action / your AI-Tools
platform.

## Files

- `check-one-thread.mjs` — Stage 1 CLI script. Fetches one page of threads from
  one course and prints the first raw thread object in full.
- `../server/forumThreadsCore.ts` — Shared login + Discussion API logic used by
  the web UI and Vercel API routes. Supports incremental polls via `since` +
  `knownThreads` (hydrate only new/updated ids). Exports
  `loginWithEnvCredentials` for one-shot password login.
- `../src/lib/courses.json` — Course catalog (`id`, `name`, optional `nameHe`,
  **`forumCategory`**) used by the course hub sidebar. Edit this JSON file to
  add courses and set each course’s technical-help forum name.
- `../src/lib/courses.ts` — Thin helpers that load `courses.json`.
- `../src/lib/threadStore.ts` — In-memory inbox + `localStorage` write-through
  cache (`tau-support-thread-store-v1`): per-course `lastCheckedAt` watermark,
  thread map, merge/upsert, retention cap, and per-thread `noAnswerNeeded`
  override (cleared on newer poll activity). `saveThreadStore` returns
  success/failure so a full localStorage quota can stop check-all instead of
  failing silently. Durable shared state lives in Supabase (see hydrate/sync).
- `../src/lib/qaPairing.ts` — Deterministic student-question ↔ staff-answer
  pairing (plain text, `lang`, `content_hash`, `resolution_text`). Used by
  the Supabase sync; no network I/O.
- `../src/lib/embedClient.ts` — Browser `POST /api/embed` client (server holds
  `OPENAI_API_KEY`).
- `../src/lib/kbEmbed.ts` — Idempotent upsert of `qa_pairs` → `kb_chunks`
  (skip when `content_hash` matches); stale chunk cleanup; Settings backfill
  (**סנכרן הטמעות**).
- `../src/lib/kbSearch.ts` — Query-time embed of a student question +
  `match_kb_chunks` RPC (**שאלות דומות** on unanswered cards).
- `../src/lib/draftAnswer.ts` — Phase 3 grounded draft: retrieve via
  `findSimilarQa`, confidence gate (`DRAFT_MIN_SIMILARITY`), strict-grounded
  `aiChat` (`/api/chat`, `gpt-4o`) or refusal (**נסח טיוטת תשובה**). No posting.
- `../server/embedCore.ts` — OpenAI `text-embedding-3-small` (1536 dims).
- `../api/embed.ts` — Vercel `POST /api/embed` (also wired in Vite middleware).
- `../api/chat.ts` — Vercel re-export of `@workspace/ai-client/vercel`
  (`POST /api/chat`). Local Vite middleware mounts the same Web `handler`
  from `@workspace/ai-client/server` (restart `pnpm dev` after Vite config
  changes).
- `../src/lib/supabase.ts` — Optional browser client for the **dedicated**
  tau-support Supabase project (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`).
  Missing env → client is `null` and a console warning is logged; the inbox
  falls back to localStorage only. Never put the service_role key here.
- `../src/lib/supabaseHydrate.ts` — On app load, rebuilds `ThreadStore` from
  `courses` / `threads` / `messages`, including shared UX flags
  (`no_answer_needed`, `seen_at`, `is_new`, `is_updated`). Local cache may fill
  gaps once when DB still has defaults.
- `../src/lib/supabaseSync.ts` — After each successful course poll, upserts
  `courses` (incl. `last_checked_at`) / thread **content** / `messages` /
  `qa_pairs`. Poll upserts do **not** overwrite `no_answer_needed` / seen /
  חדש (those are owned by toggle/mark-seen patches + hydrate). Toggle
  **אין צורך במענה** / mark-seen patches those columns immediately. Failures
  are non-blocking. On success, fires non-blocking `embedQaPairsForCourse`.
- `../supabase/schema.sql` — Canonical schema (source of truth), including
  Phase 2 `kb_chunks` + `match_kb_chunks`.
- `../supabase/migrations/001_init.sql` — Applyable copy of that schema for a
  fresh tau-support project.
- `../supabase/migrations/002_courses_last_checked_at.sql` — Adds
  `courses.last_checked_at` for projects created before that column existed.
- `../supabase/migrations/003_thread_ui_state.sql` — Adds shared inbox flags on
  `threads` (`no_answer_needed`, `seen_at`, `is_new`, `is_updated`).
- `../supabase/migrations/004_last_check_all.sql` — Singleton
  `last_check_all` row for the homepage “העדכון האחרון” timestamp (shared
  across localhost / Vercel).
- `../supabase/migrations/005_kb_chunks.sql` — Phase 2 vector table +
  `match_kb_chunks` RPC.
- `../src/lib/lastCheckAllSync.ts` — Upsert / hydrate / prefer-newer helpers
  for that singleton.
- `../src/lib/checkAllRun.ts` — Check-all cursor (`sessionStorage`, optional
  `pollMode`: `incremental` | `seedTop20`), tab lock, inter-course gap, and
  CAPTCHA/401/offline classification.
- `../api/forum-threads.ts` — `POST /api/forum-threads` with `{ courseId }` plus
  optional `since`, `knownThreads`, `maxPages`. Returns threads that need upsert
  (seed: top page; incremental: newer than watermark only).
- `../api/lms-login.ts` — `POST /api/lms-login` (no body). Server password-logs
  in once via `LMS_USERNAME` / `LMS_PASSWORD` and returns reusable session
  cookies (`csrfToken` + `sessionId` and/or JWT pair) for check-all.
- `../server/appAuth.ts` — Shared check for the **UI gate** password
  (`APP_PASSWORD` server env; never `VITE_`).
- `../api/app-login.ts` — `POST /api/app-login` with `{ password }`. Returns
  `{ ok: true }` on match, `401` on mismatch, `503` if `APP_PASSWORD` is unset.
- `../src/lib/appAuth.ts` — Client helpers: call `/api/app-login`, persist
  unlock in `sessionStorage` (`tau-support-app-unlocked`) for the tab session.
- `../src/components/AppLogin.tsx` — Full-page login (סיסמה / כניסה). Shown from
  `main.tsx` before `App` mounts so hydrate/sync do not run until unlocked.
- `fetch-forum-comments.mjs` — Stage 2 script. Full multi-course, multi-page
  polling with new-activity detection and a saved "last run" timestamp.

## Web UI (course hub)

**App password gate:** On first visit (or after closing the tab),
`main.tsx` shows `AppLogin` until `POST /api/app-login` succeeds. Unlock is
remembered in `sessionStorage` for that browser tab only. Set
`APP_PASSWORD` in local `.env` and in Vercel env (server-only — never
`VITE_APP_PASSWORD`). If unset, login returns 503 and the tool stays locked.

The tau-support page is a **centered max-width hub** (`max-w-[90rem]`, taller
viewport fill via `calc(100vh-6rem)`; not full-bleed) with an
RTL split layout inspired by the campus IL forum list:

- **Right sidebar:** white course list with a tight left-edge
  drop shadow. Rows use the same solid pastel language as the home stats
  (`sky-100` selected full-bleed, `amber-100` while **בודק כעת**, `rose`
  unanswered badges, `violet` new-count badges). The header
  strip above the list (same width as the sidebar)
  has **דף הבית** (`sky-100` when selected) and the **settings** gear on the
  visual left of that strip.
  The scrollable list starts with **פיד של כל הקורסים** (global inbox) plus all
  courses from
  `src/lib/courses.json` (`id`, `name`, optional `nameHe`, **`forumCategory`**).
  Add courses by editing that JSON file. Each course’s technical-help forum
  name (`forumCategory`, matching the campus IL URL after `/category/`) can
  differ per course and is used when polling (not shown on the sidebar row).
  If the configured name is missing in that course, polling also tries
  **פורום בעיות טכניות** and **בעיות טכניות**, and uses whichever name
  matches for topic filtering and thread URLs.
  Inbox and course rows show **חדש** counts from the local store. Courses with
  unanswered threads (`unansweredCount > 0`) are sorted to the **top** of the
  list; remaining courses keep their original `courses.json` order. **בדוק הכל** /
  **בדיקת שאלות חדשות**
  uses that same order (unanswered first, then catalog order) and **freezes**
  it for the run so the current row does not jump. Only the course currently
  in queue is marked **בודק כעת** (amber row + elapsed time), including the
  short pause before its fetch starts. No separate sidebar header line above
  the list.
- **Main pane:** soft light grey area (`#E8E8EA`) for inbox/course threads;
  white on **home**. Default selection is
  **home** (`HomeDashboard`): friendly greeting **שלום אחראי/ת תמיכה של חודש
  {month} 👋**, then **העדכון האחרון היה ב:** from shared Supabase
  (`last_check_all`, mirrored in `localStorage` as `tau-support-last-check-all`),
  a white **בדיקת שאלות חדשות** CTA (same flow
  as **בדוק הכל**), and large colorful stat boxes (total courses, unanswered,
  new activity, marked לא צרכים מענה / `noAnswerNeeded`).
  While a check-all run is active the home pane shows an animated pipeline
  (התחברות → סריקת קורסים → סיום) with progress bar, current course, and
  elapsed time; the sidebar **בודק כעת** markers stay. After a run finishes,
  a **דוח ריצה** above the CTA shows threads saved from courses
  scanned (from the in-memory summary or persisted last-run). Selecting
  inbox/course
  shows stored threads (survives reload). Global inbox is a flat list across
  courses,
  ordered by original post time (`created_at`, newest first) — not last
  activity. In **פיד של כל הקורסים**, a header toggle filters **הכל** vs
  **ללא מענה**
  (same unanswered rules as course rows / cards). Thread cards use
  `rounded-control`, a small downward drop shadow, and slightly larger type
  (`text-base` for titles and forum bodies).
- **Course header** sits only above the left thread pane (not over the
  sidebar). The right sidebar starts below that header row. Header has a
  right-edge border and a drop shadow under the bar. The outer hub box also
  uses a page-level drop shadow. On home the header is **דף הבית**. On
  inbox/course it shows compact counts
  (`N שרשורים שמורים · N ללא מענה · N תגובות חדשות מפעם שעברה`) — inbox
  includes the unanswered count too. Header height is fixed to that title +
  counts pair only (no fetch request-stats / sync status lines in the header).
- **Toolbar / check-all:** On home the primary CTA is **בדיקת שאלות חדשות**
  (dashboard); the header keeps **עצור** while a run is active. Inbox and
  course headers do not show **בדוק הכל** (courses still have
  **טען תגובות חדשות עבור קורס זה**).
  Starting a run navigates to home so the animated flow is visible.
  **בדוק הכל** / **בדיקת שאלות חדשות** runs a sequential poll of every catalog
  course
  except the sandbox, in sidebar order (unanswered first). Auth is either
  **browser cookies** (paste CSRF + JWT in Settings) **or** env password with
  a **single** `POST /api/lms-login` at the start of the run (server uses
  `LMS_USERNAME` / `LMS_PASSWORD`; the password never leaves the server). The
  login response is reused as session cookies for every course poll so the
  server does not password-login again. CAPTCHA/auth failure on that login
  aborts before any course is polled. Derived session may sit in
  `sessionStorage` for **המשך בדיקה** in the same tab; a 401 clears it.
  Single-course **טען תגובות חדשות** with cookies off still password-logs in once
  per request. Courses run one at a time with a
  short pause between them (the UI stays on **בודק כעת** for the next
  course — no “waiting” / **הבא בתור** copy). Each successful course is written to
  the in-memory store + `localStorage` cache and mirrored to Supabase
  immediately so a crash/CAPTCHA does not lose earlier courses (and other
  browsers can hydrate). A session **run cursor** skips already-finished
  courses and remembers `pollMode` (`incremental` vs `seedTop20` from Settings
  **טען 20 לכל הקורסים**); after a stop the primary action is **המשך בדיקה**, with
  **בדוק הכל מחדש** as a secondary full incremental re-poll. **עצור** means
  stop after the current course (the in-flight request is not aborted).
  The run **aborts immediately** on CAPTCHA, 401, offline, or a persist
  (quota) failure. Per-course timeouts / missing category are recorded and
  the run continues. A second tab is blocked by `tau-support-check-all-lock`.
  When a run ends (complete or incomplete), `tau-support-last-check-all` stores
  the homepage summary locally **and** upserts the singleton `last_check_all`
  row in Supabase (`completedAt` plus scanned/total/upserted/incomplete). On
  load (and when returning to the tab), the app hydrates that row and keeps the
  newer of local vs remote so localhost and Vercel show the same
  “העדכון האחרון היה ב” time.
  Header shows `בודקים N/total · course name` and elapsed seconds.
  Per-course **טען תגובות חדשות עבור קורס זה** (`LoadThreadsButton`) polls only the
  selected course and walks **all** newer threads since `lastCheckedAt`
  (page size 20, up to 200 pages, stops at the watermark). **בדוק הכל** still
  uses a shorter incremental window (settings page size, up to 5 pages).
  Settings **טען 20 לכל הקורסים** seeds each course with one page of the
  latest 20 threads (`forceSeed`, not incremental).
  Existing cards stay visible while syncing. Each course row shows
  **מעודכן לתאריך** as a date only (no clock time) from that course’s
  `lastCheckedAt` watermark (or — if never polled).
- **Settings popup:** opened from the **gear icon in the sidebar header
  strip** (visual left of **דף הבית**; `SettingsIcon` in `App.tsx`). Clicking it
  opens a
  modal dialog (`AuthSettings`, `open`/`onClose` props) with page size used by
  **בדוק הכל**, cookie auth, optional **סנכרן הטמעות**, and
  **טען 20 לכל הקורסים** (seed-all: one page of the latest 20 threads per
  catalog course, same sequential queue / lock / stop / resume as check-all,
  with `forceSeed` + `seedPageSize: 20`). Close via the ✕, the **Done** button,
  the backdrop, or the `Esc` key.
  The dialog open state is local (not persisted). Forum category is **not**
  global — it comes from each course’s `forumCategory` in `courses.json`, with
  the Hebrew technical-help name fallbacks above when the configured label is
  absent.

### Thread inbox sync

**Supabase** is the durable, shared inbox source of truth across browsers.
**Campus IL** remains the upstream forum. **localStorage** is a write-through
cache (instant paint + offline / missing-env fallback).

On load the app hydrates from Supabase (`supabaseHydrate`), including shared
thread states (**אין צורך במענה**, seen / חדש). Returning to the tab also
re-pulls those UX flags so another browser’s marks show up on localhost.
Local-only leftovers may fill DB defaults once and are then written back. If
Supabase is empty but this browser already has a local cache, that cache is
kept and **backfilled** to Supabase so other sessions can load it next time.
If hydrate fails or env is missing, the UI keeps the localStorage cache.

Poll merge rules:

1. **First poll** for a course (no `lastCheckedAt`): fetch the top page, seed
   the store **without** flooding “חדש” badges, set the watermark.
2. **Later polls** (`בדוק הכל` / **טען תגובות חדשות**): send `since=lastCheckedAt`
   and known thread snapshots. The server walks pages until activity ≤
   watermark, skips unchanged known ids, and hydrates comments only for
   new/updated threads. **טען תגובות חדשות** keeps walking until the watermark
   (all new threads for that course); **בדוק הכל** uses a shorter page budget.
   The client **merges** into the in-memory store + localStorage immediately
   after each course (does not replace; does not wait for the whole check-all
   run), then mirrors the course bucket to Supabase (including
   `courses.last_checked_at`).
3. **New vs updated:** unknown `thread.id` → `isNew`; known id with newer
   `last_activity_at` / higher `comment_count` → `isUpdated`. Opening a card
   clears those flags (`seenAt`).
4. **Retention:** at most 50 threads per course (newest by activity).
5. Auth cookies stay in **sessionStorage**; the thread store never holds JWTs.

### Supabase persistence (Phase 1)

After a successful poll merge, the client **upserts** that course’s stored
threads into the dedicated Supabase project (the full local bucket for the
course, not only threads returned by this poll — so an incremental run with 0
new hits still backfills the DB and refreshes `last_checked_at`).

Sync is computed **outside** the React `setState` updater (after `await`,
React may defer updaters; a side-effect list filled inside the updater was
staying empty and skipping Supabase entirely).

Sync is fire-and-forget. If `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are
missing, hydrate/sync are skipped (console warning) and the poll still
succeeds against localStorage. Sync errors are logged with
`[tau-support] Supabase sync failed…` and successes with
`[tau-support] Supabase synced N thread(s)…`. Neither aborts **טען תגובות חדשות** /
**בדוק הכל**.

#### Schema

Five tables plus `kb_chunks` in the dedicated project (`supabase/schema.sql`):

| Table | Key | Role |
| --- | --- | --- |
| `courses` | Open edX course id | Catalog mirror + `last_checked_at` poll watermark |
| `threads` | `campus_thread_id` | OP / question, plain `body_text` + `body_hash`, `raw` jsonb (comment tree stripped), shared UX (`no_answer_needed`, `seen_at`, `is_new`, `is_updated`) |
| `messages` | `campus_comment_id` | Flattened reply forest (`parent_id`, `is_staff`, `endorsed`, `body_text` + `body_hash`) |
| `qa_pairs` | uuid; unique `thread_id` | One student Q ↔ staff A pair per answered thread |
| `kb_chunks` | uuid; unique `(source_type, source_id)` | One embedding per Q↔A (`text-embedding-3-small`, 1536 dims) |
| `last_check_all` | singleton `id='singleton'` | Homepage “העדכון האחרון היה ב” run (`completed_at`, scanned/total/upserted, incomplete) — shared across localhost and Vercel |

RAG columns on `qa_pairs` / `kb_chunks`:

- `question_text` / `answer_text` — primary retrieval unit (embedded whole; not chunked)
- `resolution_text` — question + every staff reply (kept for future generation context)
- `content_hash` — hash of question+answer; embedding skipped when unchanged
- `lang` — `he` / `en` / `mixed` / `unknown`
- `course_id` — denormalized for in-SQL vector filters
- `kb_chunks.embedding` — `extensions.vector(1536)`; HNSW cosine index
- `kb_chunks.metadata` — `thread_id`, `answer_message_id`, `answer_selection`

RLS is on for all tables with open `anon`/`authenticated` CRUD policies
(internal staff tool). The **service_role / secret key must never ship to the
browser**. Tighten policies when adding staff login.

#### Phase 2 embeddings (built)

1. After a successful course sync (or Settings **סנכרן הטמעות**), `kbEmbed`
   loads `qa_pairs` whose `content_hash` is missing from / differs in
   `kb_chunks`, calls `POST /api/embed`, and upserts vectors. Stale chunks
   (deleted Q↔A) are removed.
2. Unanswered thread cards show **שאלות דומות**: embed the student question
   with the **same** model/API, then `rpc('match_kb_chunks')` for top-3 past
   Q↔A (optional `course_id` filter inside SQL).
3. New student questions are **query-time only** — not stored as corpus
   vectors until they become a `qa_pair`.

Requires server `OPENAI_API_KEY` (never `VITE_`). Missing key: poll/sync still
works; embed/search show a clear error.

#### Phase 3 draft answers (built)

Unanswered thread cards also show **נסח טיוטת תשובה** (`draftAnswer.ts`):

1. `threadQuestionText(thread)` → `findSimilarQa(question, { courseId,
   matchCount: 5, matchThreshold: 0.3 })`.
2. **Confidence gate**: if there are no hits or the top hit's similarity is
   below `DRAFT_MIN_SIMILARITY` (`0.45`, stricter than search's `0.3`), the
   card **refuses** — it shows the fixed sentence and does **not** call the
   model.
3. Otherwise, a numbered context block of the retrieved Q↔A is sent to
   `aiChat` (reuses `POST /api/chat`, `gpt-4o`, `temperature 0.2`) with a
   Hebrew system prompt enforcing **strict grounding**: answer only from the
   retrieved staff answers, invent nothing, and emit the exact refusal
   sentence if the context doesn't cover the question.
4. The draft renders in an editable RTL `textarea` with a **העתק** button and a
   "מבוסס על N שאלות דומות" source line. Staff copy/edit and post manually —
   **no** Campus IL writes.

Reuses the existing server `OPENAI_API_KEY` and `api/chat.ts` (no new Vercel
route). Locally, `vite.config.ts` also serves `/api/chat` via the same Web
`handler` as `/api/embed` (restart Vite after middleware changes). Missing key
or retrieval failure surfaces a clear error and never blocks poll/sync.

Later (not this phase): Word-doc hierarchical chunking, hybrid BM25/RRF,
reranker, auto-posting.

#### Q↔A pairing rules (`qaPairing.ts`)

For each **non-staff** OP thread with a hydrated comment forest and at least
one staff reply (`isStaffAuthor` on `author_label`, same patterns as
unanswered highlighting):

1. **Question** = thread title + OP body, stripped to plain text.
2. **Answer** = preferred staff reply:
   - first choice: staff comment with `endorsed === true` (earliest `created_at` if several)
   - else: earliest staff-labeled reply at any depth
3. **Resolution** = `שאלה:` + question, then every staff reply in document order.
4. `lang` from the question; `content_hash` from question + answer.
5. Upsert one `qa_pairs` row per thread (`thread_id` unique).

Staff-authored OPs and unanswered student threads: store `threads` /
`messages`, **no** `qa_pairs` row (any stale pair for that thread is deleted).
If `comments_error` is set, persist thread/messages and **leave `qa_pairs`
alone** so a failed hydrate cannot wipe a previously good pair.

#### Env

Copy `apps/tau-support/.env.example` to `.env` and fill in from the **dedicated
tau-support** Supabase project (Project Settings → API), then restart
`pnpm dev`. These are `VITE_` vars (exposed to the browser bundle) — anon key
only:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY` — server-only (Vite/Vercel); used by `/api/embed` and
  `/api/chat`

Apply `supabase/migrations/001_init.sql` (or `schema.sql`) on a fresh project
before the first sync. If columns are missing on an existing project, also apply
`002_courses_last_checked_at.sql`, `003_thread_ui_state.sql`,
`004_last_check_all.sql`, and/or `005_kb_chunks.sql`.

### Load behavior

Courses are **not** fetched on page load or on course click. Clicking a course
(or **פיד של כל הקורסים**) only shows what is already in the local store. Fetching
happens when you click **טען תגובות חדשות** (selected course) or **בדוק הכל** /
**המשך בדיקה**. Check-all does not change the selected course (stay on inbox
or whatever you were reading); the inbox updates as each course merges.
Unanswered **counts appear on sidebar rows only after** that course has threads
in the store (otherwise “—”).

By default **Use browser cookies** is on. Paste from DevTools → Cookies →
`courses.campus.gov.il`: `csrftoken`, `edx-jwt-cookie-header-payload`, and
`edx-jwt-cookie-signature` (there is often **no** `sessionid`). Uncheck the
box to use `LMS_USERNAME` / `LMS_PASSWORD` on the server instead. For
**בדוק הכל** in that mode the client calls **`POST /api/lms-login` once**
(password stays on the server), then reuses the returned session on each
course poll. Single-course **טען תגובות חדשות** still logs in per request when
cookies are off. The server resolves the category to Open edX topic ids via
`/api/discussion/v1/course_topics/`, then fetches matching threads.

### Unanswered highlighting

A thread is treated as **ללא מענה** when:

- the thread author is **not** staff/TA (same `author_label` patterns as
  replies: Staff, Community TA, Moderator, צוות / מרצה / מתרגל, …), **and**
- it is **not** locally marked **אין צורך במענה**, **and**
- either:
  - `comment_count <= 1` (Open edX counts the original post, so **1** means no
    replies yet; 0 is also treated as unanswered), **or**
  - replies were loaded and **none** have a staff/TA-style `author_label`.

Staff/TA-authored threads never get the badge, even with no replies.
If `comment_count > 1` but replies failed to load, the thread is **not**
counted as unanswered, and the card shows a notice that replies were expected
but none were returned. When `comment_count <= 1` (no real replies), that
notice is omitted.
Unanswered threads get a clearer red highlight (solid `red-100` fill, same
hue as before) and a **ללא מענה** badge to the
**left** of the title in the main list; the sidebar badge is the count of such
threads in the last fetch for that course. On sidebar rows, when that count is
greater than 0 it is shown as a **rose pastel chip** matching the home stats
(no message icon); a count of 0 is shown as plain text. Those courses also float to the top
of the sidebar while keeping relative order within the unanswered / answered
groups.

On threads that would otherwise be unanswered, the card’s action button is
**אין צורך במענה** (replaces the old Raw JSON toggle). Clicking it stores
`noAnswerNeeded` on the inbox entry **and** patches `threads.no_answer_needed`
in Supabase (shared across browsers), clears **ללא מענה** / unread flags,
and shows an emerald **אין צורך במענה** badge. **בטל סימון** undoes it.
On the next poll, if that thread’s `last_activity_at` or `comment_count`
advances, the override is cleared so the thread can show as unanswered again.

Staff/TA replies (same `author_label` patterns) get an amber highlight and a
**צוות** badge next to the author line in the reply tree. Staff/TA-authored
threads get the same amber card treatment and a **צוות** badge next to the
title (and still never get **ללא מענה**). Tagged thread/reply cards keep a
soft tint fill matching the badge color; untagged cards use a white background.

Each loaded thread includes full reply trees when available (merged from
endorsed/non-endorsed comment lists). Reply hydration is **bounded** per thread
(`MAX_COMMENT_DEPTH = 4` levels and `MAX_CHILD_FETCHES_PER_THREAD = 60` child
requests in `forumThreadsCore.ts`). Open edX discussions are only two levels
deep, so these caps never truncate real replies; they exist so a busy course
(e.g. the Python intro) or a thread whose API echoes comments back can’t fan
out into an unbounded request chain that makes a poll appear to hang forever.
Child **fetches** only run for top-level responses (`depth === 0`): when a
student replies *on* a staff response, Campus IL sets `child_count > 0` on that
response, and a further child-of-child fetch is what used to echo the parent
and render the same reply nested inside itself. `fetchChildComments` also keeps
only rows whose `parent_id` matches the requested parent.
In addition to the depth/fetch caps, `hydrateCommentTree` tracks the **ancestor
path** (both comment ids and a content signature of `author_label` + body) and
drops any fetched child that matches an ancestor or a same-id sibling.
The UI also runs `sanitizeCommentForest` on load / merge / render
(`src/lib/commentTree.ts`) so already-cached bad trees in `localStorage` are
cleaned without requiring a re-poll.
A temporary **request stats** line in the
main-column header shows login vs forum API call counts after each fetch.
Thread titles link to campus IL
(`app.campus.gov.il/discussions/.../posts/{id}`); the **Open in forum**
affordance sits immediately to the **left** of the author/replies/published
subtitle (not flush to the card edge). Thread cards show `created_at` (when
the post was published), not last activity; reply blocks also use each
comment’s `created_at`. Bodies use `rendered_body` when
available; markdown reference images in `raw_body` are expanded inline.

Credentials stay server-side only (`LMS_BASE_URL`, `LMS_USERNAME`,
`LMS_PASSWORD` in Vercel project env or a local `.env` file for `pnpm dev`).

## Credentials needed

Set these as environment variables when running either script (never
hardcoded into the files):

- `APP_PASSWORD` — password for the tau-support **UI login screen** (server-only;
  set in local `.env` and Vercel). Distinct from campus IL credentials below.
- `LMS_BASE_URL` — your campus IL site's base URL. For campus IL you can use
  either `https://app.campus.gov.il` (discussions UI) or
  `https://courses.campus.gov.il` (LMS backend). The app automatically uses
  `courses.campus.gov.il` for login and API calls when `app.campus.gov.il` is
  configured, because the app frontend does not expose the standard `/login`
  CSRF cookie.
- `LMS_USERNAME` — your campus IL **email** (the address you type at login)
- `LMS_PASSWORD` — your campus IL password

Dedicated tau-support Supabase project (optional; poll still works without them):

- `VITE_SUPABASE_URL` — project URL
- `VITE_SUPABASE_ANON_KEY` — public anon key (never the service_role secret)

Embeddings / similar-question search / draft answers (server-only):

- `OPENAI_API_KEY` — used by `POST /api/embed` and `POST /api/chat` (never
  prefix with `VITE_`). Both routes are available on Vercel and in the local
  Vite middleware.

**Important:** Open edX v1 login expects the POST field `email`, not
`email_or_username`. Sending the wrong field name produces a generic Hebrew/English
“error receiving login information” message even when credentials are correct. The
web app tries v2 (authn MFE) first, then v1 with the correct `email` field.

If password login is risky (CAPTCHA) or you prefer browser auth, copy cookies
after a manual login on `courses.campus.gov.il`:

- `LMS_CSRF_TOKEN` — value of the `csrftoken` cookie
- `LMS_JWT_HEADER_PAYLOAD` — value of `edx-jwt-cookie-header-payload`
- `LMS_JWT_SIGNATURE` — value of `edx-jwt-cookie-signature`
- `LMS_SESSION_ID` — optional; only if a classic `sessionid` cookie exists

When CSRF + JWT cookies (or CSRF + sessionid) are set, username/password login
is skipped.

## Known risks (and why they're low)

- **Bot / CAPTCHA challenge**: Campus IL may show “Let's confirm you are human”.
  The app detects this, **stops immediately** (no retry loop), and shows a clear
  error within ~30s per request (3-minute max for the whole run). Complete the
  CAPTCHA once in your browser, then use **browser cookies** instead of password
  login.
- **Failed-login lockout**: Open edX can lock an account for 15–30 minutes
  after ~5–6 *wrong-password* attempts in a row. A single correct login per
  run never triggers this.
- **Campus IL login split**: `app.campus.gov.il` is the modern UI; login cookies
  and the Discussion API live on `courses.campus.gov.il`. The web app handles
  this automatically. If password login still fails (e.g. Google SSO), use
  `LMS_SESSION_ID` + `LMS_CSRF_TOKEN` from your browser DevTools.
- **Read-only**: the script only ever performs `GET` requests. It cannot
  alter course or forum data.
- **API volume**: Each course fetch may issue dozens of requests when loading
  full reply trees. **בדוק הכל** with cookies (or after one `/api/lms-login`)
  does not password-login per course. Single-course **טען תגובות חדשות** without
  cookies still logs in once per click. Reply hydration is capped per thread
  (see **depth / child-fetch budget** above) so a single heavy or misbehaving
  thread cannot balloon the request count. Use fewer threads while testing.
  Busy courses can still take up to the 3-minute client timeout on the first
  seed — prefer **Use browser cookies** and keep **threads to load** low (3).
- **JWT cookies vs sessionid**: Campus IL browser logins often expose
  `edx-jwt-cookie-header-payload` + `edx-jwt-cookie-signature` instead of
  `sessionid`. The app reconstitutes these into an `Authorization: JWT …`
  header for the Discussion API. If you get 401, open
  `app.campus.gov.il/discussions` to refresh tokens, then re-copy cookies.

### Safer workflow after a CAPTCHA

1. In Chrome/Edge, log in normally at [courses.campus.gov.il](https://courses.campus.gov.il)
   and pass the image CAPTCHA.
2. DevTools → Application → Cookies → `courses.campus.gov.il` → copy
   `csrftoken`, `edx-jwt-cookie-header-payload`, and
   `edx-jwt-cookie-signature` (Campus IL often has no `sessionid`).
3. In the tau-support UI, expand **Settings**, enable **Use browser cookies**,
   and paste those three values (or set `LMS_CSRF_TOKEN` /
   `LMS_JWT_HEADER_PAYLOAD` / `LMS_JWT_SIGNATURE` in `.env` for CLI/server-only
   use). Then use **בדיקת שאלות חדשות** on **דף הבית**, open **פיד של כל הקורסים**,
   or click **בדוק הכל** from an inbox/course header (or a course) to
   seed/sync the local inbox.
4. Restart the dev server if you changed `.env`. Cookie values from the form are
   sent only with that request and stored in **sessionStorage** until you close
   the browser tab. On load the inbox hydrates from **Supabase**;
   `localStorage` (`tau-support-thread-store-v1`) is a write-through cache.

The main open question is not safety — it's whether your specific campus IL
account actually has read access to each course's forum via this API, which
Stage 1 answers directly.
