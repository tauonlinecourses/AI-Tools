# Security — Platform Auth, Supabase, and tool APIs

**Source of truth** for how staff auth and database access work across the Tools Hub monorepo.

## Architecture (current)

- **Identity + groups** live in the **Course-Builder** Supabase project (`profiles`, `groups`, `group_members`, `group_tools`, `auth_handoff_codes`).
- **`profiles.status`** is `pending` | `approved` | `rejected` (default `approved` for legacy users). Only **approved** users see hub tools / handoff / admin. Display name is always the email local-part (`handle_new_user`); never user-entered.
- **Hub** requires Platform login; tools listed = union of the user’s group tool permissions. Hub auth also loads the user’s group memberships (`listUserGroups` → `groups` select under member RLS) for the header user menu and `accountStatus` from `profiles`. `isAdmin` is true when the user belongs to slug `Admin (all tools)` — gates the header admin button and `/admin` UI.
- **Hub admin API** (`/api/admin`): service_role list/create/update of groups + memberships, plus `inviteUser` / `sendInviteEmail` / `approveUser` / `rejectUser` / `removeUser` (Auth `deleteUser`; cannot delete self). Every request verifies JWT then Admin group membership. Non-admins cannot read all users/groups via RLS (member-only selects).
- **Public register API** (`/api/register`): `GET ?resource=groups` (excludes Admin) and `POST` create pending user with password via `auth.admin.createUser` (**no Auth email**). Self-reg stores `requested_group_id`; no `group_members` until approve.
- Opening a **standalone** tool uses a **handoff code** (hub → tool `/auth/callback`) because those apps are on separate `*.vercel.app` hosts. Redeem is **idempotent within the code TTL** (so React StrictMode / retries do not bounce users back to the hub). Handoff requires approved status.
- **Direct tool links** (bookmark / pasted URL): each standalone app wraps UI in `ToolAuthGate`. **Not signed in** (no Platform session on the tool origin) → redirect to hub login with `?returnUrl=<tool URL>`. **Signed in without that tool’s group entitlement or not approved** → redirect to hub home (catalog). After hub login (or when already signed in on the hub), `returnUrl` is resolved only against known catalog origins/`hubPath`s: entitled users are handed off (or navigated in-app for hub-hosted tools); others stay on the hub. `assertToolAccess` also requires `profiles.status = 'approved'`.
- **Hub-hosted** tools (`hubPath`, e.g. MBZ Explorer at `/mbz-explorer`) share the hub origin and Platform session — no handoff; access is checked via `allowedToolIds` on the hub route (and approved gate). Unsigned → login; signed-in without entitlement → redirect to hub home.
- Every standalone tool `vercel.json` **must** include the SPA rewrite `"/((?!api/).*)" → "/index.html"`. Without it, hub handoff to `/auth/callback` returns Vercel `NOT_FOUND` even when `/` works.
- **Course-Builder data**: RLS is **authenticated-only** (same JWT as hub login).
- **Tau-Support data**: anon policies removed; browser never uses service_role. The BFF `/api/tau-data` verifies the Course-Builder JWT + `tau-support` entitlement, then uses Tau `service_role`.
- **Virtual-Support data**: dedicated Supabase project; RLS on with no anon/authenticated policies. The BFF `/api/data` and `/api/ask` verify the Course-Builder JWT + `virtual-support` entitlement, then use `VS_SUPABASE_SERVICE_ROLE_KEY`.
- Sensitive `/api/*` routes (chat, LMS, embed, youtube-transcript, tau-data, virtual-support data/ask) require a Platform Bearer token and (where applicable) group tool access.
- **Tau / Virtual Support local Vite**: `vite.config.ts` stays free of static `@workspace/auth` imports (Node ESM). Local JWT gate is `server/devPlatformAuth.ts`; local data/ask routes use `server.ssrLoadModule`.
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
| **Admin invite** | Admin enters work email + groups → **Create user** (`generateLink`, approved + memberships, no email yet) → same modal shows user details + shareable link (copy) + optional **Send invite email** (`sendInviteEmail` re-invites via delete + `inviteUserByEmail`) → invitee opens `/auth/set-password` | Built-in Auth email ~2/hour — prefer copy link or attach **custom SMTP** for volume |
| **Self-register** | Login → Create account → email + password + group (not Admin) → `status=pending` → pending screen until admin **Approve** (confirm/change groups) or **Reject** | **No** Auth confirmation email; admin approval is the trust gate |

## Forgot + change password

| Flow | How | Email |
|---|---|---|
| **Forgot password** | Login → **Forgot password?** → `/auth/forgot-password` → `resetPasswordForEmail` with `redirectTo` = hub `/auth/set-password` → user opens recovery link → same `SetPasswordPage` (recovery copy via `PASSWORD_RECOVERY` / `type=recovery`) → `updatePlatformPassword` | Same Auth email limits as invites — prefer **custom SMTP** for volume. UI always shows a neutral “if an account exists…” success to avoid email enumeration. |
| **Change password** | Signed-in user menu → **Change password** / **שינוי סיסמה** → `/auth/change-password` → verify current password (`signInWithPassword`) → `updatePlatformPassword` | None |

Helpers live in `@workspace/auth`: `resetPlatformPasswordForEmail`, `verifyPlatformPassword`, `updatePlatformPassword`.

Supabase Auth URL config (Course-Builder project → Authentication → URL configuration):

- **Site URL** should be the hub (local: `http://localhost:5173`, prod: hub Vercel URL) — not `localhost:3000`.
- **Redirect URLs** must allow `http://localhost:5173/auth/set-password` and the prod `https://<hub>/auth/set-password`. Invite **and** password-recovery emails reuse this path. If a redirect is not allowlisted, Supabase falls back to Site URL and the invite/`redirect_to` will look wrong (e.g. `http://localhost:3000` with no `/auth/set-password`).

Invite and forgot-password APIs pass `redirectTo` from the browser (`window.location.origin + /auth/set-password`).

## Threat findings addressed

| Issue | Severity | Mitigation |
|---|---|---|
| Open anon RLS on CB + Tau | Critical | Authenticated-only (CB); anon denied (Tau) + BFF |
| UI password not protecting DB/APIs | Critical | Real Supabase Auth + JWT on APIs |
| `/api/lms-login` open | Critical | Requires Platform JWT + tau-support access |
| Open `/api/chat` / embed OpenAI proxy | High | JWT + tool entitlement |
| Video-curator local Vite `/api/*` ungated | High | Dev middleware requires Platform JWT + `video-curator` access |
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

| Name | Slug | Tools | Notes |
|---|---|---|---|
| Admin | `Admin (all tools)` | `course-builder`, `mbz-explorer`, `tau-support`, `virtual-support`, `video-curator` | Also unlocks hub **User admin** (`/admin`) |
| צוות מערכות למידה | `learning-systems-team` | `tau-support`, `course-builder`, `virtual-support` | |

Hub tool access for a user = union of all groups they belong to via `group_members`. Constant: `ADMIN_GROUP_SLUG` in `@workspace/auth` / hub `platformAuth.ts`.

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
where g.slug = 'learning-systems-team'  -- or 'Admin (all tools)'
  and u.email = 'YOUR_STAFF_EMAIL'
on conflict do nothing;
```

4. Set hub/tool env vars; set `PLATFORM_SUPABASE_SERVICE_ROLE_KEY` on hub (and tau) Vercel projects.
5. Apply migration `010_profile_status.sql` on Course-Builder.

### Local Windows + corporate TLS proxy

Hub handoff (`/api/auth-handoff`) verifies JWTs from **Node**. Corporate TLS inspection often breaks Node (`SELF_SIGNED_CERT_IN_CHAIN` / `fetch failed`) while browser login still works. Local hub/tau `vite.config.ts` imports `packages/auth/src/devTls.ts`, which sets `NODE_TLS_REJECT_UNAUTHORIZED=0` on Windows (override with `PLATFORM_STRICT_TLS=1`). Production Vercel is unaffected.

## Migrations

- Course-Builder: `007_platform_auth_groups.sql` (applied), ops note in `008_ops_seed_shared_staff.sql`, `009_seed_learning_systems_team.sql` (צוות מערכות למידה → tau-support + course-builder), `010_profile_status.sql` (`profiles.status`, `requested_group_id`, reviewed fields + `handle_new_user` metadata), `011_tool_access_requires_approved.sql` (`user_allowed_tools` / `user_has_tool_access` require `profiles.status = 'approved'`), `012_virtual_support_tool.sql` (**must be applied** on platform project `qpctlsahnyarmrmeplpl`: extends `group_tools_tool_id_check` with `virtual-support` and grants it to Admin / learning-systems; without this, hub admin create/edit group fails when that tool is selected)
- Tau-Support: `008_lock_anon_access.sql` (applied)
- Virtual-Support: `001_init.sql` (folders, documents, doc_chunks, match RPC, doc-images bucket; RLS locked)

## Access-control audit (what blocks unauthenticated / unauthorized use)

| Surface | Gate |
|---|---|
| Hub `/`, `/en` | `PlatformAuthProvider` → login if no session; pending/rejected → status page |
| Hub `/admin` | UI `isAdmin` + API `assertUserIsAdmin` |
| Hub `/mbz-explorer/*` | `ApprovedOnly` + `allowedToolIds` includes `mbz-explorer` |
| Standalone tools (direct URL / bookmark) | `ToolAuthGate`: no session → hub login `?returnUrl=`; no entitlement / not approved → hub home |
| `returnUrl` after login | Only catalog origins / `hubPath`s; entitlement re-checked before handoff |
| Tool `/api/*` (chat, embed, lms, tau-data, youtube-transcript, …) | Bearer Platform JWT + approved + `user_has_tool_access(toolId)` |
| Tau data (Supabase) | Anon/authenticated RLS denied; browser uses `/api/tau-data` BFF only |
| Course-Builder data | Same Platform JWT; authenticated RLS |
| Legacy `POST /api/app-login` (tau-support) | **Retired** (`410`) — does not unlock the app |

**Apply migration `011`** on the Course-Builder Supabase project so RPC entitlement helpers enforce approved status at the database layer.

## Later

- Dedicated Platform Supabase project after Pro (transfer Auth schema)
- Custom parent domain for cookie SSO (replace handoff)

## Production smoke

After deploy / env / migration changes, run [prod-smoke-checklist.md](./prod-smoke-checklist.md).
