# Tools Workspace — Agent Build Instructions

**Start here.** These docs tell Cursor agents how this Turborepo monorepo is structured and how to build, extend, and deploy it.

> **Post-migration (2026):** The repo is a single Next.js platform at `apps/platform`. Legacy per-app Vite docs (07–09) are kept for reference only — follow [`../Migration.md`](../Migration.md) and the platform structure in [`../../README.md`](../../README.md).

---

## How agents should use these docs

1. **Read this README** to pick the right file for the task.
2. **For platform work**, start with [`../../README.md`](../../README.md) and [`../Migration.md`](../Migration.md).
3. **Open only the relevant section(s)** — do not reload every file unless the task spans the whole monorepo.
4. **Prefer existing code in the repo** over regenerating from snippets when the app/package already exists.
5. **After changing conventions**, update the matching file here so docs stay the source of truth.

---

## Section map

| File | When to read | Topics |
|---|---|---|
| [01-overview.md](./01-overview.md) | Orientation | Platform structure, tech stack |
| [02-monorepo-root.md](./02-monorepo-root.md) | Root / workspace setup | `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.env` |
| [03-packages-config.md](./03-packages-config.md) | Design tokens / shared TS | `packages/config` |
| [04-packages-ui-basics.md](./04-packages-ui-basics.md) | Shared UI primitives | Button, Card, globals.css |
| [05-packages-ui-layout.md](./05-packages-ui-layout.md) | Hub nav / layout | PageLayout, `hub.ts` |
| [06-packages-ai-client.md](./06-packages-ai-client.md) | AI calls from tools | `useToolChat`, `completeViaGateway` |
| [07-apps-hub-config.md](./07-apps-hub-config.md) | **Legacy** — Vite hub | Superseded by `apps/platform/app/page.tsx` |
| [08-apps-hub-ui.md](./08-apps-hub-ui.md) | **Legacy** — Vite hub UI | Superseded by platform hub |
| [09-apps-tool-starter.md](./09-apps-tool-starter.md) | **Legacy** — Vite template | Superseded by `app/tools/_starter/` |
| [10-run-deploy-conventions.md](./10-run-deploy-conventions.md) | Run, ship, add tools | `pnpm` scripts, Vercel, design rules |
| [ai-api-flow.md](./ai-api-flow.md) | AI request flow | `/api/ai` gateway, security, roadmap |

---

## Quick task → file lookup

| Task | Read |
|---|---|
| Understand the monorepo | `01` + root `README.md` |
| Change env / turbo / root scripts | `02` |
| Change colors, fonts, radii | `03` + design rules in `10` |
| Change Button / Card / shared chrome | `04`–`05` |
| Change AI client / API key behavior | `06` + `ai-api-flow.md` |
| Add or rename a tool | Root `README.md` “Add a new tool” |
| Change hub homepage UI | `apps/platform/app/page.tsx` + `lib/tools.config.ts` |
| Deploy to Vercel | `10` (one project, root `apps/platform`) |

---

## Related paths in the repo

- **App:** `apps/platform` (hub + tools + `/api/ai` gateway)
- **Shared:** `packages/config`, `packages/ui`, `packages/ai-client`
- **Migration spec:** [`../Migration.md`](../Migration.md)
- **Root overview:** [`../../README.md`](../../README.md)
