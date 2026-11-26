# Security — Platform Auth, Supabase, and tool APIs

**Source of truth** for how staff auth and database access work across the Tools Hub monorepo.

## Architecture (current)

- **Identity + groups** live in the **Course-Builder** Supabase project (`profiles`, `groups`, `group_members`, `group_tools`, `auth_handoff_codes`).
- **`profiles.status`** is `pending` | `approved` | `rejected` (column default `approved` for legacy users; a missing profile or unrecognized value counts as pending everywhere via `normalizeAccountStatus`). Approve and reject only apply to pending users (409 otherwise). `sendInviteEmail` only applies to approved users who have never signed in, because it deletes and recreates the account. Only **approved** users see hub tools / handoff / admin. Display name is always the email local-part (`handle_new_user`); never user-entered.
- **Hub** requires Platform login; tools listed = union of the user’s group tool permissions. Hub auth also loads the user’s group memberships (`listUserGroups` → `groups` select under member RLS) for the header user menu and `accountStatus` from `profiles`. `isAdmin` is true when the user belongs to slug `admin-all-tools` (legacy alias `Admin (all tools)` still accepted) — gates the header admin button and `/admin` UI. Editing the Admin group in the hub UI must not rewrite that slug (pinned to canonical).
- **Hub admin API** (`/api/admin`): service_role list/create/update of groups + memberships, plus `inviteUser` / `sendInviteEmail` / `approveUser` / `rejectUser` / `removeUser` (Auth `deleteUser`; cannot delete self). Every request verifies JWT then Admin group membership. Non-admins cannot read all users/groups via RLS (member-only selects).
- **Public register API** (`/api/register`): `GET ?resource=groups` (excludes Admin) and `POST` create pending user with password via `auth.admin.createUser` (**no Auth email**). Self-reg stores `requested_group_id`; no `group_members` until approve.
- Opening a **standalone** tool uses a **handoff code** (hub → tool `/auth/callback`) because those apps are on separate `*.vercel.app` hosts. Redeem is **idempotent within the code TTL** (so React StrictMode / retries do not bounce users back to the hub). Each new code deletes expired rows, which still hold session tokens; `used_at` is an audit field and does not block reuse. Handoff requires approved status.
- **Ended logins**: sign-out is global, so a tab can hold a login Auth has already ended. The hub then shows its login page with a sign-in-again notice. Standalone tools show a banner from `ToolAuthGate` and wait for a click, so unsaved work is not lost to an automatic redirect; their `authFetch` calls stay pending from that point, so no screen shows an auth error behind the banner.
- **Direct tool links** (bookmark / pasted URL): each standalone app wraps UI in `ToolAuthGate`. **Not signed in** (no Platform session on the tool origin) → redirect to hub login with `?returnUrl=<tool URL>`. **Signed in without that tool’s group entitlement or not approved** → redirect to hub home (catalog). After hub login (or when already signed in on the hub), `returnUrl` is resolved only against known catalog origins/`hubPath`s using the provider’s already-loaded `allowedToolIds` (no extra RPC); entitled users are handed off (or navigated in-app for hub-hosted tools); others stay on the hub. `assertToolAccess` is a single `user_has_tool_access` RPC (approval is enforced inside that RPC). After a successful hub handoff callback, `ToolAuthGate` skips a second entitlement check (mint already verified access); APIs still enforce via `requireToolAccessFromRequest`.
- **Hub-hosted** tools (`hubPath`: MBZ Explorer `/mbz-explorer`, Dictionary Tool `/dictionary-tool`, Video Transcriber `/video-transcriber`) share the hub origin and Platform session — no handoff; access is checked via `allowedToolIds` on the hub route (and approved gate). Unsigned → login; signed-in without entitlement → redirect to hub home.
- Every standalone tool `vercel.json` **must** include the SPA rewrite `"/((?!api/).*)" → "/index.html"`. Without it, hub handoff to `/auth/callback` returns Vercel `NOT_FOUND` even when `/` works.
- **Course-Builder data**: RLS is **authenticated-only** (same JWT as hub login). Migration `016_course_mbz_roundtrip.sql` gave `anon` full access to `course_mbz_sources`, `course_mbz_bindings` and the `course-mbz` bucket; **apply `020_mbz_authenticated_only.sql`** to remove it. "Authenticated" means any logged-in account, not only approved Course Builder users.
- **Tau-Support data**: anon policies removed; browser never uses service_role. The BFF `/api/tau-data` verifies the Course-Builder JWT + `tau-support` entitlement, then uses Tau `service_role`.
- **Virtual-Support data**: dedicated Supabase project; RLS on with no anon/authenticated policies. The BFF `/api/data` and `/api/ask` verify the Course-Builder JWT + `virtual-support` entitlement, then use `VS_SUPABASE_SERVICE_ROLE_KEY`.
- Sensitive `/api/*` routes (chat, LMS, embed, youtube-transcript, tau-data, virtual-support data/ask) require a Platform Bearer token and (where applicable) group tool access.
- **Local Vite (all apps)**: `vite dev` runs the same `api/*.ts` handlers as production through `packages/dev-api` (`vercelApiPlugin`), so local routes get the same Platform JWT, approved-status and tool gates. There is no separate dev auth code. `vite.config.ts` still never statically imports `@workspace/auth` (Node ESM); handlers load through `server.ssrLoadModule`.
- **Server auth helpers** all live in `@workspace/auth/server`: `verifyPlatformRequest`, `assertUserIsApproved`, `assertUserHasToolAccess`, `requireToolAccessFromRequest`, `assertUserIsAdmin`, handoff codes, and the re-exported `ADMIN_GROUP_SLUG` / `PLATFORM_TOOL_IDS`. The hub uses them too; it no longer has a local copy.
- **`withPlatformAuth(handler, { toolId? })`** wraps every `api/chat.ts`. With `toolId` it requires approved status plus tool access; without it (the hub) only approved status. `AuthError` becomes `{ error }` with its status; any other auth failure is 401 `Unauthorized`, and a handler throw is 500. It also unwraps a `{ default: fn }` CJS module object.
- **Vercel APIs**: `@workspace/auth/server` resolves to a **CJS `dist/` build** (`pnpm --filter @workspace/auth build`). Each app `vercel.json` builds auth (then ai-client) before the app so handoff/chat serverless functions do not crash on raw `.ts` imports.

```text
Hub login → Course-Builder Auth JWT
         → profiles.status must be approved
         → groups → allowed tool_ids
         → handoff code → tool setSession
         → tool APIs / CB Supabase (authenticated) / Tau BFF (service_role)

Admin invite → invite email (or copyable action link) → /auth/set-password → approved user
Self-register → pending profile → admin approve (+ groups) → approved user
Forgot password → recovery email → /auth/set-password → update password
Signed-in change password → verify current → update password
```

## Invite + self-register

| Flow | How | Email |
|---|---|---|
| **Admin invite** | Admin enters work email + groups → **Create user** (`generateLink`, approved + memberships, no email yet) → same modal shows shareable link (copy) **or** optional **Send invite email** (`sendInviteEmail` = delete + `inviteUserByEmail`). Use **one** delivery path: sending email issues a new one-time token and invalidates any previously copied link. After email, do **not** call `generateLink` again (that used to rotate the token a second time so the email link landed on `/auth/set-password` with no session). Invitee opens `/auth/set-password` | Built-in Auth email ~2/hour — prefer copy link or attach **custom SMTP** for volume |
| **Self-register** | Login → Create account → email + password + group (not Admin) → `status=pending` → pending screen until admin **Approve** (confirm/change groups) or **Reject** | **No** Auth confirmation email; admin approval is the trust gate |

## Forgot + change password

| Flow | How | Email |
|---|---|---|
| **Forgot password** | Login → **Forgot password?** → `/auth/forgot-password` → `resetPasswordForEmail` with `redirectTo` = hub `/auth/set-password` → user opens recovery link → same `SetPasswordPage` (recovery copy via `PASSWORD_RECOVERY` / `type=recovery`) → `updatePlatformPassword` | Same Auth email limits as invites — prefer **custom SMTP** for volume. UI always shows a neutral “if an account exists…” success to avoid email enumeration. |
| **Change password** | Signed-in user menu → **Change password** / **שינוי סיסמה** → `/auth/change-password` → verify current password (`signInWithPassword`) → `updatePlatformPassword` | None |

Helpers live in `@workspace/auth`: `resetPlatformPasswordForEmail`, `verifyPlatformPassword`, `updatePlatformPassword`.

Supabase Auth URL config (Course-Builder project → Authentication → URL configuration):

- **Site URL** must be the **prod** hub (`https://ai-tools-tauonline.vercel.app`) — **not** `http://localhost:3000` or `http://localhost:5173`. Failed verifies and email fallbacks redirect to Site URL; a localhost Site URL is why invite errors open `localhost:3000/#error=…`.
- **Redirect URLs** must include `https://ai-tools-tauonline.vercel.app/auth/set-password` (and `http://localhost:5173/auth/set-password` for local forgot-password). If the prod path is missing, Auth rejects the invite redirect.

Invite create/copy link: keep Supabase’s official `action_link` token and only rewrite `redirect_to` to the live hub (do not rebuild from `hashed_token` alone — that yields `otp_expired`). After `inviteUserByEmail`, never regenerate an invite link for the same user until you intentionally want to invalidate the email. Forgot-password still uses `window.location.origin + /auth/set-password`. `SetPasswordPage` surfaces `#error` / `error_description` from failed Auth redirects.

## Threat findings addressed

| Issue | Severity | Mitigation |
|---|---|---|
| Open anon RLS on CB + Tau | Critical | Authenticated-only (CB); anon denied (Tau) + BFF |
| UI password not protecting DB/APIs | Critical | Real Supabase Auth + JWT on APIs |
| `/api/lms-login` open | Critical | Requires Platform JWT + tau-support access |
| Open `/api/chat` / embed OpenAI proxy | High | JWT + tool entitlement |
| Video-curator local Vite `/api/*` ungated | High | Local Vite runs the production handlers (`packages/dev-api`), so Platform JWT + `video-curator` access apply |
| Hub `/api/chat` without approved check | Medium | `assertUserIsApproved` after JWT verify |
| Pending user + leftover group_members | Medium | RPC helpers require `profiles.status = 'approved'` (migration `011`) |
| Legacy tau `APP_PASSWORD` / `/api/app-login` | Medium | Endpoint returns `410`; client `AppLogin` / `appAuth` helpers removed; Platform Auth is the only UI gate |
| Storage SVG + anon write | High | SVG removed; writes via service_role BFF |
| Forum HTML XSS | High | `sanitizeForumHtml` before `dangerouslySetInnerHTML` |
| `rls_auto_enable` executable by anon | Medium | EXECUTE revoked from anon/authenticated |

## Env matrix

| Variable | Where | Notes |
|---|---|---|
| `VITE_PLATFORM_SUPABASE_URL` / `ANON_KEY` | Hub + every tool (browser) | Course-Builder project — **required**; do not rely on `VITE_SUPABASE_*` fallback |
| `VITE_SUPABASE_*` (course-builder) | Course-Builder app | Same project as Platform (also set `VITE_PLATFORM_*`) |
| `VITE_SUPABASE_*` (tau-support) | Tau browser | Data project URL only; never use as Platform Auth |
| `VITE_SUPABASE_*` (virtual-support) | VS browser | Data project URL only; never use as Platform Auth |
| `PLATFORM_SUPABASE_SERVICE_ROLE_KEY` | Hub (+ tau / VS server) | Course-Builder service_role for handoff codes / group checks |
| `TAU_SUPABASE_SERVICE_ROLE_KEY` | Tau server only | Never `VITE_` |
| `VS_SUPABASE_URL` / `VS_SUPABASE_SERVICE_ROLE_KEY` | Virtual Support server only | Never `VITE_` for the service role |
| `OPENAI_API_KEY` | Server only | Never `VITE_` |

## Permission groups (Course-Builder `groups` / `group_tools`)

Hub tool access for a user = union of all groups they belong to via `group_members`. Constants: `ADMIN_GROUP_SLUG` (`admin-all-tools`) and `PLATFORM_TOOL_IDS` in `@workspace/auth` (`src/constants.ts`, re-exported from `@workspace/auth/server`). Group **tool lists are edited in Hub Admin** and can drift from migration seed SQL — treat the table below as a **live snapshot**, not an immutable seed.

**Live snapshot (Course-Builder prod, 2026-11-26):**

| Slug | Tools (live) | Notes |
|---|---|---|
| `admin-all-tools` | `course-builder`, `dictionary-tool`, `mbz-explorer`, `tau-support`, `video-curator`, `video-transcriber`, `virtual-support` | Unlocks hub **User admin** (`/admin`). `isAdminGroupSlug` also accepts legacy `Admin (all tools)`. |
| `learning-systems-team` | `course-builder`, `dictionary-tool`, `tau-support`, `video-transcriber` | Does **not** currently include `virtual-support` (that lives on `virtual-tau` + Admin). |
| `ai-tools-team` | `course-builder`, `dictionary-tool`, `mbz-explorer`, `video-curator`, `video-transcriber` | |
| `online-courses-developing` | `course-builder`, `dictionary-tool`, `video-transcriber` | |
| `virtual-tau` | `dictionary-tool`, `video-transcriber`, `virtual-support` | |

`group_tools.tool_id` check constraint (live) allows: `video-curator`, `course-builder`, `mbz-explorer`, `tau-support`, `virtual-support`, `tool-starter`, `dictionary-tool`, `video-transcriber` (matches `PLATFORM_TOOL_IDS`).

## Ops — onboard a user

**Preferred:** Hub **User admin** → Invite user (email + groups), or approve a self-registered pending user.

**Fallback (SQL / Dashboard):**

1. Course-Builder project → Authentication → create email/password user (profile `status` defaults to `approved`).
2. Confirm `profiles` row exists (trigger `handle_new_user`).
3. Insert membership (replace slug + email):

```sql
insert into public.group_members (group_id, user_id)
select g.id, p.id
from public.groups g
join public.profiles p on true
join auth.users u on u.id = p.id
where g.slug = 'learning-systems-team'  -- or 'admin-all-tools'
  and u.email = 'YOUR_STAFF_EMAIL'
on conflict do nothing;
```

4. Set hub/tool env vars; set `PLATFORM_SUPABASE_SERVICE_ROLE_KEY` on hub (and tau / VS server) Vercel projects.
5. On a **new** Course-Builder DB only: apply Platform Auth migrations through `011` (and tool seeds `012`/`014`/`019` as needed). Live prod already has these — see Migrations below. If Admin slug was rewritten by the hub UI, apply `013_normalize_admin_group_slug.sql`.

### Local Windows + corporate TLS proxy

Hub handoff (`/api/auth-handoff`) verifies JWTs from **Node**. Corporate TLS inspection often breaks Node (`SELF_SIGNED_CERT_IN_CHAIN` / `fetch failed`) while browser login still works. Local hub/tau `vite.config.ts` imports `packages/auth/src/devTls.ts`, which sets `NODE_TLS_REJECT_UNAUTHORIZED=0` on Windows (override with `PLATFORM_STRICT_TLS=1`). Production Vercel is unaffected. The other apps (video-curator, course-builder, mbz-explorer, tool-starter) do not import it, so on such a network their local `/api/*` calls with a token return 503 "Cannot reach Platform Auth from the local server (TLS/proxy)…". Install `win-ca` / set `NODE_EXTRA_CA_CERTS`, or import `devTls` in that app's config.

## Migrations (repo files ↔ live DBs)

Repo SQL lives under each app’s `supabase/migrations/`. Many historical changes were applied in the SQL editor, so Supabase Dashboard **Migration History is incomplete** — prefer schema probes over `list_migrations`. Project refs (also in hub `toolDocs.ts`):

| App DB | Supabase project ref | MCP / agent access |
|---|---|---|
| Course-Builder (Platform Auth + CB data) | `qpctlsahnyarmrmeplpl` | Verified |
| Tau-Support | `gfatxeznxjplrljcohog` | Verified |
| Virtual Support | `qzjaymstjgwguagqtdit` | **Not verified** (no MCP permission for this project) |

### Course-Builder — live-verified (2026-11-26)

**Platform Auth / entitlements (present on live):**

| Repo file | Live evidence |
|---|---|
| `007_platform_auth_groups.sql` | `profiles`, `groups`, `group_members`, `group_tools`, `auth_handoff_codes`; RPCs `user_allowed_tools` / `user_has_tool_access` / `handle_new_user` |
| `010_profile_status.sql` | `profiles.status`, `requested_group_id`, `reviewed_at`, `reviewed_by` |
| `011_tool_access_requires_approved.sql` | `user_allowed_tools` filters `p.status = 'approved'` (enforced via that helper; `user_has_tool_access` delegates to it) |
| `012` / `014` / `019` tool allowlist + seeds | `group_tools` CHECK includes `dictionary-tool`, `virtual-support`, `video-transcriber`; those tool ids are seeded on groups (see snapshot above). Admin slug is `admin-all-tools` (`013`) |
| `008_ops_seed_shared_staff.sql` / `009_seed_learning_systems_team.sql` | Ops/seed notes — group memberships and tool lists may have been edited since |

**App data (present on live):**

| Repo file(s) | Live evidence |
|---|---|
| `016` + **`020_mbz_authenticated_only.sql`** | Tables `course_mbz_sources` / `course_mbz_bindings` exist; RLS policies are `authenticated_all` only (no anon) |
| `013_section_videos_folder.sql` | `sections.videos_folder_url` |
| `015` / `023` / `024` comments | `page_comments` (+ `mentions`, author identity cols); `component_comments.author_display_name` |
| `021_section_banner_url.sql` | `sections.banner_image_url` |
| `022_user_templates.sql` | `user_templates` table |
| `005_page_workflow_status.sql` | `pages.workflow_status` |
| `014_page_number_label.sql` | Drops `pages.number_label` if present (live has no `number_label` — consistent) |
| `017` / `018` MBZ backends | Supporting MBZ round-trip; see course-builder agents docs |

Full ordered list: `apps/course-builder/supabase/migrations/` (`001`–`024`).

### Tau-Support — live-verified (2026-11-26)

RLS is **enabled** on all public tables; **`pg_policies` is empty** (deny-by-default for anon/authenticated — BFF uses `service_role`). That is the intended outcome of `008_lock_anon_access.sql`.

| Repo file | Live evidence |
|---|---|
| `001_init.sql` | `courses`, `threads`, `messages`, `qa_pairs` |
| `002_courses_last_checked_at.sql` | `courses.last_checked_at` |
| `003_thread_ui_state.sql` | Thread UI columns (inbox flags) |
| `004_last_check_all.sql` | `last_check_all` |
| `005_kb_chunks.sql` | `kb_chunks` |
| `006_info_docs.sql` / `007_info_doc_common_questions.sql` / `009_info_doc_pinned.sql` | `info_docs` with `common_questions`, `pinned` |
| `008_lock_anon_access.sql` | RLS on, no policies |
| `010_question_dashboard.sql` | `question_embeddings`, `question_dashboard_snapshot` |
| `011_question_categories.sql` | `question_embeddings.category`, `category_key` |
| `012_courses_forum_topic_id.sql` | `courses.forum_topic_id` |

### Virtual Support — repo only (not live-verified)

Expected files (apply in order on project `qzjaymstjgwguagqtdit`): `001_init.sql` (folders, documents, doc_chunks, match RPC, doc-images bucket; RLS locked), `002_hybrid_search.sql`, `003_ask_log.sql`, `004_ask_metrics.sql`. Re-check in the Supabase SQL editor or grant the agent MCP access to that project before treating them as applied.

## Access-control audit (what blocks unauthenticated / unauthorized use)

| Surface | Gate |
|---|---|
| Hub `/`, `/en` | `PlatformAuthProvider` → login if no session; pending/rejected → status page |
| Hub `/admin` | UI `isAdmin` + API `assertUserIsAdmin`. Group tool edits only assign `PLATFORM_TOOL_IDS`; unknown/WIP tool ids already on a group are preserved. |
| Hub `/mbz-explorer/*` | `ApprovedOnly` + `allowedToolIds` includes `mbz-explorer` |
| Hub `/dictionary-tool/*` | `ApprovedOnly` + `allowedToolIds` includes `dictionary-tool` |
| Hub `/video-transcriber/*` | `ApprovedOnly` + `allowedToolIds` includes `video-transcriber` (guide page in hub; no separate app package) |
| Standalone tools (direct URL / bookmark) | `ToolAuthGate`: no session → hub login `?returnUrl=`; no entitlement / not approved → hub home |
| `returnUrl` after login | Only catalog origins / `hubPath`s; uses provider `allowedToolIds` (mint still enforces on handoff) |
| Tool `/api/*` (chat, embed, lms, tau-data, youtube-transcript, …) | Bearer Platform JWT + `user_has_tool_access(toolId)` (RPC requires approved) |
| Tau data (Supabase) | Anon/authenticated RLS denied; browser uses `/api/tau-data` BFF only |
| Course-Builder data | Same Platform JWT; authenticated RLS |
| Legacy `POST /api/app-login` (tau-support) | **Retired** (`410`) — does not unlock the app |

**Live (2026-11-26):** migration `011` behavior is present on Course-Builder (`user_allowed_tools` filters `profiles.status = 'approved'`). Re-apply from repo only if a new environment is missing it.

## Later

- Dedicated Platform Supabase project after Pro (transfer Auth schema)
- Custom parent domain for cookie SSO (replace handoff)

## Production smoke

After deploy / env / migration changes, run [prod-smoke-checklist.md](./prod-smoke-checklist.md).
