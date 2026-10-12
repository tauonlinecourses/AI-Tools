# Security — Platform Auth, Supabase, and tool APIs

**Source of truth** for how staff auth and database access work across the Tools Hub monorepo.

## Architecture (current)

- **Identity + groups** live in the **Course-Builder** Supabase project (`profiles`, `groups`, `group_members`, `group_tools`, `auth_handoff_codes`).
- **Hub** requires Platform login; tools listed = union of the user’s group tool permissions.
- Opening a tool uses a **handoff code** (hub → tool `/auth/callback`) because apps are on separate `*.vercel.app` hosts. Redeem is **idempotent within the code TTL** (so React StrictMode / retries do not bounce users back to the hub).
- **Course-Builder data**: RLS is **authenticated-only** (same JWT as hub login).
- **Tau-Support data**: anon policies removed; browser never uses service_role. The BFF `/api/tau-data` verifies the Course-Builder JWT + `tau-support` entitlement, then uses Tau `service_role`.
- Sensitive `/api/*` routes (chat, LMS, embed, youtube-transcript, tau-data) require a Platform Bearer token and (where applicable) group tool access.
- **Tau local Vite**: `vite.config.ts` stays free of static `@workspace/auth` imports (Node ESM). Local JWT gate is `server/devPlatformAuth.ts`; local `/api/tau-data` uses `server/tauDataHandler.ts` (opaque dynamic import). `@workspace/auth` relative imports use `.js` suffixes so Node can load the package when APIs do import it.

```text
Hub login → Course-Builder Auth JWT
         → groups → allowed tool_ids
         → handoff code → tool setSession
         → tool APIs / CB Supabase (authenticated) / Tau BFF (service_role)
```

## Threat findings addressed

| Issue | Severity | Mitigation |
|---|---|---|
| Open anon RLS on CB + Tau | Critical | Authenticated-only (CB); anon denied (Tau) + BFF |
| UI password not protecting DB/APIs | Critical | Real Supabase Auth + JWT on APIs |
| `/api/lms-login` open | Critical | Requires Platform JWT + tau-support access |
| Open `/api/chat` / embed OpenAI proxy | High | JWT + tool entitlement |
| Storage SVG + anon write | High | SVG removed; writes via service_role BFF |
| Forum HTML XSS | High | `sanitizeForumHtml` before `dangerouslySetInnerHTML` |
| `rls_auto_enable` executable by anon | Medium | EXECUTE revoked from anon/authenticated |

## Env matrix

| Variable | Where | Notes |
|---|---|---|
| `VITE_PLATFORM_SUPABASE_URL` / `ANON_KEY` | Hub + every tool (browser) | Course-Builder project — **required**; do not rely on `VITE_SUPABASE_*` fallback |
| `VITE_SUPABASE_*` (course-builder) | Course-Builder app | Same project as Platform (also set `VITE_PLATFORM_*`) |
| `VITE_SUPABASE_*` (tau-support) | Tau browser | Data project URL only; never use as Platform Auth |
| `PLATFORM_SUPABASE_SERVICE_ROLE_KEY` | Hub (+ tau server) | Course-Builder service_role for handoff codes / group checks |
| `TAU_SUPABASE_SERVICE_ROLE_KEY` | Tau server only | Never `VITE_` |
| `OPENAI_API_KEY` | Server only | Never `VITE_` |

## Ops — shared staff user

1. Course-Builder project → Authentication → create email/password user.
2. Confirm `profiles` row exists (trigger `handle_new_user`).
3. Insert membership into `all-staff`:

```sql
insert into public.group_members (group_id, user_id)
select g.id, p.id
from public.groups g
join public.profiles p on true
join auth.users u on u.id = p.id
where g.slug = 'all-staff'
  and u.email = 'YOUR_STAFF_EMAIL'
on conflict do nothing;
```

4. Set hub/tool env vars; set `PLATFORM_SUPABASE_SERVICE_ROLE_KEY` on hub (and tau) Vercel projects.

### Local Windows + corporate TLS proxy

Hub handoff (`/api/auth-handoff`) verifies JWTs from **Node**. Corporate TLS inspection often breaks Node (`SELF_SIGNED_CERT_IN_CHAIN` / `fetch failed`) while browser login still works. Local hub/tau `vite.config.ts` imports `packages/auth/src/devTls.ts`, which sets `NODE_TLS_REJECT_UNAUTHORIZED=0` on Windows (override with `PLATFORM_STRICT_TLS=1`). Production Vercel is unaffected.

## Migrations

- Course-Builder: `007_platform_auth_groups.sql` (applied), ops note in `008_ops_seed_shared_staff.sql`
- Tau-Support: `008_lock_anon_access.sql` (applied)

## Later

- Real per-user accounts; admin UI for groups
- Dedicated Platform Supabase project after Pro (transfer Auth schema)
- Custom parent domain for cookie SSO (replace handoff)
