# AI-Tools

A Turborepo + pnpm monorepo of AI tools. Each tool is an independent React app; all share the same design language and UI packages. Every app deploys to Vercel separately.

## Project structure

```
AI-Tools/
├── apps/                 ← Applications
│   ├── hub/              ← Homepage launcher — links to every tool
│   ├── tool-starter/     ← Template for creating a new tool
│   └── video-curator/    ← Tool for curating video transcripts and exporting clips
│
├── packages/             ← Shared code
│   ├── config/           ← Shared Tailwind, TypeScript, and ESLint configs
│   ├── ui/               ← Shared React component library
│   └── ai-client/        ← OpenAI API wrapper
│
├── agents/               ← Build instructions for the Cursor agent
├── turbo.json
└── pnpm-workspace.yaml
```

| Part | Role |
|---|---|
| `apps/hub` | Main launcher; tool list comes from `tools.config.ts` |
| `apps/tool-*` / other tools | One independent app per tool |
| `packages/*` | Shared design, UI, and AI client used by every app |

## Tech stack

React + Vite + TypeScript · Tailwind CSS · Turborepo · pnpm · Vercel

## Quick start

```bash
pnpm install
pnpm dev
```

## Add a new tool

1. Copy `apps/tool-starter/` → `apps/tool-myname/`
2. In the copy, set `"name": "tool-myname"` in `package.json`
3. Pick a free Vite port in `vite.config.ts` (hub `5173`, video-curator `5174`, tool-starter `5175`, next free…)
4. Build the tool in `src/App.tsx` (keep `PageLayout`)
5. Register it in `apps/hub/src/tools.config.ts` with `devUrl` (`http://localhost:<port>`) and a placeholder `url`
6. Deploy on Vercel (one project per app):
   - **Root Directory:** `apps/tool-myname`
   - **Install Command:** `cd ../.. && pnpm install`
   - **Build Command:** `cd ../.. && pnpm build --filter tool-myname`
   - **Output Directory:** `dist`
   - Enable **Include source files outside of the Root Directory** (for `packages/*`)
7. Set the live `url` in `tools.config.ts`. If this is the first hub deploy, also set `HUB_PROD_URL` in `packages/ui/src/hub.ts`
