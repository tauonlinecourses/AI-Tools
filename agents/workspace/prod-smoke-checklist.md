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

---

## A. Live ops (you — before smoke)

Do these in the dashboards; the repo cannot apply them for you.

### A1. Course-Builder Supabase — migration `011`

1. Open the **Course-Builder** Supabase project → SQL Editor (or CLI).
2. Apply [`apps/course-builder/supabase/migrations/011_tool_access_requires_approved.sql`](../../apps/course-builder/supabase/migrations/011_tool_access_requires_approved.sql).
3. Confirm `user_allowed_tools` / `user_has_tool_access` require `profiles.status = 'approved'`.

Also confirm earlier auth migrations (`007`–`010`) are already on the live DB.

### A2. Supabase Auth URL configuration (Course-Builder project)

Authentication → URL configuration:

- **Site URL:** `https://ai-tools-tauonline.vercel.app` (hub prod — not `localhost:3000`).
- **Redirect URLs** include:
  - `https://ai-tools-tauonline.vercel.app/auth/set-password`
  - `http://localhost:5173/auth/set-password` (local hub, if still used)

Invite and password-recovery emails both use `/auth/set-password`.

### A3. Vercel Shared env (all four live projects)

For **hub**, **video-curator**, **course-builder**, **tau-support**, **virtual-support**:

| Variable | Projects | Notes |
|---|---|---|
| `OPENAI_API_KEY` | All that call `/api/chat` | Team Shared; server only — never `VITE_` |
| `VITE_PLATFORM_SUPABASE_URL` / `VITE_PLATFORM_SUPABASE_ANON_KEY` | All | Course-Builder project |
| `PLATFORM_SUPABASE_SERVICE_ROLE_KEY` (+ URL/anon if used server-side) | Hub, Tau | Handoff / entitlement RPCs |
| `TAU_SUPABASE_SERVICE_ROLE_KEY` (+ Tau URL) | Tau only | BFF; never `VITE_` |
| `LMS_*` | Tau only | As needed |

Checks:

- [ ] No `VITE_OPENAI_API_KEY` or `VITE_*` service_role anywhere
- [ ] Shared env **linked** to each project; **Redeploy** all four after linking/changing
- [ ] Each app Root Directory = `apps/<name>`; SPA rewrite present (`"/((?!api/).*)" → "/index.html"`)
- [ ] Hub [`tools.config.ts`](../../apps/hub/src/tools.config.ts) `url` values match live hosts

### A4. Tau data plane

- [ ] Tau migration `008_lock_anon_access.sql` applied (anon policies locked)

---

## B. Curl checks (unauthenticated — expect failure)

PowerShell examples (adjust hosts if URLs change):

```powershell
# Chat without Bearer → 401
foreach ($base in @(
  "https://ai-tools-tauonline.vercel.app",
  "https://ai-tools-video-curator.vercel.app",
  "https://ai-tools-tau-support.vercel.app"
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
- [ ] Tau `/api/app-login` → `410`

---

## C. Browser smoke (approved staff account)

Use an **approved** user with known group entitlements.

### Auth & catalog

- [ ] Hub login works; catalog shows only tools the user is entitled to
- [ ] Pending user sees pending status (no tool handoff)
- [ ] Rejected user cannot open tools

### Handoff & direct URLs

- [ ] From hub, open Video Curator → lands signed-in (SPA rewrite; `/auth/callback` works)
- [ ] From hub, open Course Builder → signed-in
- [ ] From hub, open Tau Support → signed-in
- [ ] Paste a standalone tool URL while **signed out** → redirect to hub login with `returnUrl`
- [ ] Paste a tool URL while signed in **without** that tool’s entitlement → hub home
- [ ] Hub-hosted MBZ Explorer `/mbz-explorer` respects entitlement (no access → hub home)

### AI & admin

- [ ] One AI action succeeds in an entitled tool (e.g. video-curator segment or tau draft)
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
