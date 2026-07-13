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

To add a new tool: copy `apps/tool-starter`, then register it in `apps/hub/src/tools.config.ts`.
