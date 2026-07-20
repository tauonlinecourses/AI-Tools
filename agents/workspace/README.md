# Tools Workspace — Agent Build Instructions

**Start here.** These docs tell Cursor agents how this Turborepo monorepo is structured and how to build, extend, and deploy it.

The former single file `agents/workspace.md` is split into the numbered files below (~100–250 lines each) so agents can load only the section they need.

---

## How agents should use these docs

1. **Read this README** to pick the right file for the task.
2. **Open only the relevant section(s)** — do not reload every file unless the task spans the whole monorepo.
3. **Follow numbered order (01 → 10)** when scaffolding from scratch.
4. **Prefer existing code in the repo** over regenerating from these snippets when the app/package already exists; treat the docs as the intended architecture and conventions.
5. **After changing monorepo conventions** (ports, shared packages, deploy, design tokens, adding a tool), update the matching file here so docs stay the source of truth.

Each section file has Previous / Next links at the top.

---

## Section map

| File | When to read | Topics |
|---|---|---|
| [01-overview.md](./01-overview.md) | Any new task; orientation | What you’re building, tech stack, directory tree |
| [02-monorepo-root.md](./02-monorepo-root.md) | Root / workspace setup | `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.env`, `.gitignore` |
| [03-packages-config.md](./03-packages-config.md) | Design tokens / shared TS | `packages/config` — Tailwind base, `tsconfig` |
| [04-packages-ui-basics.md](./04-packages-ui-basics.md) | Shared UI primitives | `packages/ui` package.json, `globals.css`, Button, Card |
| [05-packages-ui-layout.md](./05-packages-ui-layout.md) | Hub nav / layout | Input, Badge, Spinner, `hub.ts`, PageLayout, exports |
| [06-packages-ai-client.md](./06-packages-ai-client.md) | OpenAI calls from tools | `packages/ai-client` — `callAI` / `prompt` |
| [07-apps-hub-config.md](./07-apps-hub-config.md) | Hub app wiring / tool list | Hub package, Vite port 5173, `tools.config.ts` |
| [08-apps-hub-ui.md](./08-apps-hub-ui.md) | Hub launcher UI | `apps/hub/src/App.tsx` |
| [09-apps-tool-starter.md](./09-apps-tool-starter.md) | New tool from template | `apps/tool-starter`, `/api/chat` proxy |
| [10-run-deploy-conventions.md](./10-run-deploy-conventions.md) | Run, ship, or style a tool | `pnpm` scripts, Vercel, add-a-tool checklist, design rules |

---

## Quick task → file lookup

| Task | Read |
|---|---|
| Understand the monorepo | `01` |
| Change env / turbo / root scripts | `02` |
| Change colors, fonts, radii | `03` + design rules in `10` |
| Change Button / Card / shared chrome | `04`–`05` |
| Change Hub ↔ tool back-link URLs | `05` (`hub.ts`) |
| Change AI client / API key behavior | `06` + env notes in `02` / Vercel in `10` |
| Add or rename a tool on the hub | `07` (+ checklist in `10`) |
| Change hub homepage UI | `08` |
| Create a new tool app | `09` then `10` |
| Deploy to Vercel / ports / conventions | `10` |

---

## Local ports (strict)

| App | Port |
|---|---|
| hub | 5173 |
| video-curator | 5174 |
| tool-starter | 5175 |

Assign the next free port when adding a tool.

---

## Related paths in the repo

- Live apps: `apps/hub`, `apps/video-curator`, `apps/tool-starter`
- Shared: `packages/config`, `packages/ui`, `packages/ai-client`
- Root project overview: [`../../README.md`](../../README.md)
