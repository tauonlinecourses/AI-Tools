<!-- AGENT DOC: Overview — What You Are Building -->
<!-- Part of: agents/workspace/ — start at README.md -->

> **Agents:** Read [README.md](./README.md) first. This file is **part 1 of 10**.
>
> → Next: [02-monorepo-root.md](./02-monorepo-root.md)

---

# Tools Workspace — Overview

## What You Are Building

A Turborepo monorepo with a **single Next.js platform** (`apps/platform`):

- **Hub** — root page (`app/page.tsx`) listing tools from `lib/tools.config.ts`
- **Tools** — self-contained folders under `app/tools/<name>/`
- **AI gateway** — one route (`app/api/ai/route.ts`) using the Vercel AI SDK
- **Shared packages** — design system, UI components, and AI client hooks

One Vercel project deploys the whole platform.

---

## Tech Stack

| Concern | Choice |
|---|---|
| Monorepo | Turborepo |
| Package manager | pnpm |
| Framework | Next.js 15 (App Router) + React + TypeScript |
| Styling | Tailwind CSS v3 |
| AI | Vercel AI SDK (`ai`, `@ai-sdk/openai`) |
| Shared config | `packages/config` |
| Shared components | `packages/ui` |
| AI client hooks | `packages/ai-client` |
| Deployment | Vercel (root directory: `apps/platform`) |

---

## Directory Structure

```
AI-Tools/
├── apps/
│   └── platform/
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx              ← Hub
│       │   ├── api/ai/route.ts       ← AI gateway
│       │   └── tools/
│       │       ├── _starter/         ← Template (not routed)
│       │       └── video-curator/
│       ├── agents/
│       │   ├── registry.ts
│       │   └── types.ts
│       ├── lib/tools.config.ts
│       └── package.json
├── packages/
│   ├── config/
│   ├── ui/
│   └── ai-client/
├── agents/
└── turbo.json
```

---

## Adding a Tool

1. Copy `app/tools/_starter/` → `app/tools/<tool-name>/`
2. Edit `ai.config.ts` and `page.tsx`
3. Add entry to `lib/tools.config.ts` and import in `agents/registry.ts`

See root [`README.md`](../../README.md) for details.
