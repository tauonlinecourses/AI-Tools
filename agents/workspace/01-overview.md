<!-- AGENT DOC: Overview — What You Are Building -->
<!-- Topic: overview, tech stack, directory structure -->
<!-- Part of: agents/workspace/ — start at README.md -->

> **Agents:** Read [README.md](./README.md) first for the full map. This file is **part 1 of 10**.
>
> ← Previous: *(start)*
> → Next: [02-monorepo-root.md](./02-monorepo-root.md)

---

# Tools Workspace — Overview

Part of the agent build instructions. Full map: [README.md](./README.md).

## What You Are Building

A Turborepo monorepo containing:
- A **hub app** (`apps/hub`) — a central launcher page that links to all tools
- Multiple **tool apps** (`apps/tool-*`) — independent React apps, one per tool
- Shared **packages** — design system, UI components, and AI client used by every app

Every app deploys to Vercel independently. Every app shares the same design language via shared packages.

---

## Tech Stack

| Concern | Choice |
|---|---|
| Monorepo | Turborepo |
| Package manager | pnpm |
| Framework | React + Vite + TypeScript |
| Styling | Tailwind CSS v3 |
| Shared config | `packages/config` |
| Shared components | `packages/ui` |
| AI API wrapper | `packages/ai-client` |
| Deployment | Vercel (one project per app) |

---

## Final Directory Structure

```
workspace/
├── apps/
│   ├── hub/                        ← Launcher homepage
│   │   ├── package.json            ← Live: https://ai-tools-tauonline.vercel.app (port 5173)
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   ├── tailwind.config.ts
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       └── tools.config.ts     ← List of all tools (name, url, description, icon)
│   │
│   ├── tool-starter/               ← Starter template (copy this to create any new tool)
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   ├── tailwind.config.ts
│   │   ├── api/
│   │   │   └── chat.ts             ← Production OpenAI proxy (Vercel serverless)
│   │   └── src/
│   │       ├── main.tsx
│   │       └── App.tsx
│   │
│   └── video-curator/              ← Video Curator tool (hub id: video-curator)
│       ├── api/
│       │   ├── segment-transcript.ts  ← Vercel serverless (uses @vercel/node)
│       │   └── youtube-transcript.ts  ← Vercel serverless; relative imports need `.js` (NodeNext)
│       ├── server/
│       │   └── youtubeTranscriptCore.ts
│       └── …                       Live: https://ai-tools-video-curator.vercel.app (local Vite port 5174)
│                                       Uses PageLayout (Hub nav) like tool-starter; padded={false} for full-bleed UI
│
│   Local Vite ports (strict): hub 5173 · video-curator 5174 · tool-starter 5175
│   Hub links: DEV → each tool’s `devUrl` (localhost); production/Vercel build → `url`
│
├── packages/
│   ├── config/                     ← Shared Tailwind + TypeScript + ESLint configs
│   │   ├── package.json
│   │   ├── tailwind.base.ts        ← Design tokens (colors, fonts, spacing, radii)
│   │   └── tsconfig.base.json
│   │
│   ├── ui/                         ← Shared React component library
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts            ← Exports all components
│   │       ├── components/
│   │       │   ├── Button.tsx
│   │       │   ├── Card.tsx
│   │       │   ├── Input.tsx
│   │       │   ├── Badge.tsx
│   │       │   ├── Spinner.tsx
│   │       │   └── PageLayout.tsx
│   │       └── styles/
│   │           └── globals.css     ← Base CSS resets and font imports
│   │
│   └── ai-client/                  ← Shared AI API wrapper
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           └── client.ts           ← OpenAI wrapper (dev: direct; prod: /api/chat)
│
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── .env.example
```

