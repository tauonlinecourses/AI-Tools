# Production smoke checklist (internal staff)

Short “does the basics still work?” pass after deploy or env/migration changes.
Not a full feature suite — critical paths only.

**Audience:** internal Platform Auth users.  
**Related:** [security.md](./security.md), [10-run-deploy-conventions.md](./10-run-deploy-conventions.md), [ai-api-flow.md](./ai-api-flow.md).

Live prod hosts (from hub `tools.config.ts`):

| App | URL |
|---|---|
| Hub | `https://ai-tools-tauonline.vercel.app` |
| Video Curator | `https://ai-tools-video-curator.vercel.app` |
| Course Builder | `https://ai-tools-course-builder.vercel.app` |
| Tau Support | `https://ai-tools-tau-support.vercel.app` |
| Virtual Support | `https://ai-tools-virtual-support.vercel.app` |
| MBZ Explorer | Hub path `/mbz-explorer` (same origin as hub) |
| Dictionary Tool | Hub path `/dictionary-tool` (same origin as hub) |
| Video Transcriber | Hub path `/video-transcriber` (same origin as hub) |

---

## A. Live ops (you — before smoke)

Do these in the dashboards; the repo cannot apply them for you.

### A1. Course-Builder Supabase — confirm live schema (ref `qpctlsahnyarmrmeplpl`)

Dashboard: https://supabase.com/dashboard/project/qpctlsahnyarmrmeplpl

**Already verified live (2026-11-26)** — see [security.md § Migrations](./security.md#migrations-repo-files--live-dbs). Re-check after any manual SQL / new migration:

1. `user_allowed_tools` filters `profiles.status = 'approved'` ([`011_tool_access_requires_approved.sql`](../../apps/course-builder/supabase/migrations/011_tool_access_requires_approved.sql)).
2. `group_tools` CHECK allows `dictionary-tool`, `virtual-support`, `video-transcriber` (`012` / `014` / `019`).
3. MBZ tables use authenticated-only RLS ([`020_mbz_authenticated_only.sql`](../../apps/course-builder/supabase/migrations/020_mbz_authenticated_only.sql)) — no anon policies on `course_mbz_*`.
4. Admin slug is still `admin-all-tools` (`013`).

On a **new** environment only: apply repo migrations in order from `apps/course-builder/supabase/migrations/` (`007`–`011` auth first, then tool seeds, then app data).

### A2. Supabase Auth URL configuration (Course-Builder project)

Authentication → URL configuration:

- **Site URL:** `https://ai-tools-tauonline.vercel.app` (hub prod — not `localhost:3000`).
- **Redirect URLs** include:
  - `https://ai-tools-tauonline.vercel.app/auth/set-password`
  - `http://localhost:5173/auth/set-password` (local hub, if still used)

Invite and password-recovery emails both use `/auth/set-password`.

### A3. Vercel Shared env (five live projects)

For **hub**, **video-curator**, **course-builder**, **tau-support**, **virtual-support**:

| Variable | Projects | Notes |
|---|---|---|
| `OPENAI_API_KEY` | All that call `/api/chat` (and VS `/api/ask`) | Team Shared; server only — never `VITE_` |
| `VITE_PLATFORM_SUPABASE_URL` / `VITE_PLATFORM_SUPABASE_ANON_KEY` | All | Course-Builder project |
| `PLATFORM_SUPABASE_SERVICE_ROLE_KEY` (+ URL/anon if used server-side) | Hub, Tau, Virtual Support | Handoff / entitlement RPCs |
| `TAU_SUPABASE_SERVICE_ROLE_KEY` (+ Tau URL) | Tau only | BFF; never `VITE_` |
| `VS_SUPABASE_URL` / `VS_SUPABASE_SERVICE_ROLE_KEY` | Virtual Support only | BFF data/ask; never `VITE_` for the service role |
| `LMS_*` | Tau only | As needed |

Checks:

- [ ] No `VITE_OPENAI_API_KEY` or `VITE_*` service_role anywhere
- [ ] Shared env **linked** to each project; **Redeploy** all five after linking/changing
- [ ] Each app Root Directory = `apps/<name>`; SPA rewrite present (`"/((?!api/).*)" → "/index.html"`)
- [ ] Hub [`tools.config.ts`](../../apps/hub/src/tools.config.ts) `url` / `hubPath` values match live hosts

### A4. Tau + Virtual Support data planes

**Tau-Support** (ref `gfatxeznxjplrljcohog`, https://supabase.com/dashboard/project/gfatxeznxjplrljcohog) — **verified live 2026-11-26** through repo `012`:

- [ ] RLS enabled on public tables; **no** `anon`/`authenticated` policies (BFF / service_role only) — `008_lock_anon_access.sql`
- [ ] Feature columns/tables present when using those features: `info_docs.pinned` (`009`), question dashboard tables (`010`), `question_embeddings.category` (`011`), `courses.forum_topic_id` (`012`)

**Virtual Support** (ref `qzjaymstjgwguagqtdit`, https://supabase.com/dashboard/project/qzjaymstjgwguagqtdit) — **not verified via agent MCP** (permission denied). Confirm in the dashboard:

- [ ] Migrations `001_init` → `002_hybrid_search` → `003_ask_log` → `004_ask_metrics` applied
- [ ] RLS locked (no anon/authenticated data policies); BFF uses `VS_SUPABASE_SERVICE_ROLE_KEY`

---

## B. Curl checks (unauthenticated — expect failure)

PowerShell examples (adjust hosts if URLs change):

```powershell
# Chat without Bearer → 401
foreach ($base in @(
  "https://ai-tools-tauonline.vercel.app",
  "https://ai-tools-video-curator.vercel.app",
  "https://ai-tools-tau-support.vercel.app",
  "https://ai-tools-virtual-support.vercel.app"
)) {
  try {
    Invoke-WebRequest -Method POST -Uri "$base/api/chat" `
      -ContentType "application/json" `
      -Body '{"messages":[{"role":"user","content":"hi"}]}' `
      -UseBasicParsing
  } catch {
    $_.Exception.Response.StatusCode.value__
  }
}

# Legacy app-login → 410
try {
  Invoke-WebRequest -Method POST -Uri "https://ai-tools-tau-support.vercel.app/api/app-login" `
    -ContentType "application/json" -Body '{"password":"x"}' -UseBasicParsing
} catch {
  $_.Exception.Response.StatusCode.value__
}
```

- [ ] Hub `/api/chat` without auth → `401`
- [ ] Video Curator `/api/chat` without auth → `401`
- [ ] Tau Support `/api/chat` without auth → `401`
- [ ] Virtual Support `/api/chat` without auth → `401`
- [ ] Tau `/api/app-login` → `410`

---

## C. Browser smoke (approved staff account)

Use an **approved** user with known group entitlements.

### Auth & catalog

- [ ] Hub login works; **full catalog** is visible; tools the user lacks entitlement for are dimmed / not openable (not hidden)
- [ ] Pending user sees pending status (no tool handoff)
- [ ] Rejected user cannot open tools

### Handoff & direct URLs

- [ ] From hub, open Video Curator → lands signed-in (SPA rewrite; `/auth/callback` works)
- [ ] From hub, open Course Builder → signed-in
- [ ] From hub, open Tau Support → signed-in
- [ ] From hub, open Virtual Support → signed-in
- [ ] Paste a standalone tool URL while **signed out** → redirect to hub login with `returnUrl`
- [ ] Paste a tool URL while signed in **without** that tool’s entitlement → hub home
- [ ] Hub-hosted MBZ Explorer `/mbz-explorer` respects entitlement (no access → hub home)
- [ ] Hub-hosted Dictionary Tool `/dictionary-tool` respects entitlement (no access → hub home)
- [ ] Hub-hosted Video Transcriber `/video-transcriber` respects entitlement (no access → hub home); entitled users see the SharePoint install guide

### AI & admin

- [ ] One AI action succeeds in an entitled tool (e.g. video-curator segment, tau draft, or virtual-support Ask)
- [ ] Optional: POST `/api/chat` with allowed auth but disallowed `model` → `400`
- [ ] Admin: invite **or** approve a pending user once (email/SMTP limits apply)

---

## D. Pass / fail

| Area | Pass? | Notes |
|---|---|---|
| A Live ops | | |
| B Unauth curls | | |
| C Browser smoke | | |

If anything fails, fix env/rewrite/migration first; then redeploy the affected app and re-run only the failed section.
