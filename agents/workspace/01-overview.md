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
Product overview (hub + tools list): [`../../README.md`](../../README.md). Technical setup: [`../../DEVELOPMENT.md`](../../DEVELOPMENT.md).

## What You Are Building

A Turborepo monorepo containing:
- A **hub app** (`apps/hub`) — a central launcher page that links to all tools
- Multiple **tool apps** under `apps/` — React apps, one per tool (plus `tool-starter` scaffold)
- Shared **packages** — design system, UI, Platform auth, AI client, MBZ parser, and local API helper

**Standalone** tools (video-curator, course-builder, tau-support, virtual-support) each deploy to their own Vercel project. **Hub-hosted** tools (MBZ Explorer, Dictionary Tool, Drupal Helper) ship inside the hub Vercel project via Vite aliases; **Video Transcriber** is a guide-only route implemented in the hub itself. Every app shares the same design language via shared packages.

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
| Platform auth | `packages/auth` |
| AI API wrapper | `packages/ai-client` |
| MBZ read/write | `packages/mbz-parser` |
| Local `/api` under Vite | `packages/dev-api` |
| Deployment | Vercel (one project per standalone app; hub-hosted tools ship with hub) |

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
│   ├── tool-starter/               ← Copy template only (not listed on the hub)
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   ├── tailwind.config.ts
│   │   ├── agents/                 ← Required on every tool; copy with the template
│   │   │   └── README.md
│   │   ├── api/
│   │   │   └── chat.ts             ← AI route: re-exports @workspace/ai-client/vercel (Vercel serverless)
│   │   └── src/
│   │       ├── main.tsx
│   │       └── App.tsx
│   │
│   ├── video-curator/              ← Video Curator tool (hub id: video-curator; SPA rewrite required for /auth/callback)
│   │   ├── agents/                 ← Per-tool agent docs
│   │   ├── api/
│   │   │   ├── chat.ts             ← AI route: re-exports @workspace/ai-client/vercel (used by transcript segmentation)
│   │   │   └── youtube-transcript.ts  ← Vercel serverless; relative imports need `.js` (NodeNext)
│   │   ├── server/
│   │   │   └── youtubeTranscriptCore.ts
│   │   └── …                       Live: https://ai-tools-video-curator.vercel.app (local Vite port 5174)
│   │                                   Uses PageLayout (Hub nav) like tool-starter; padded={false} for full-bleed UI
│   │
│   ├── course-builder/             ← Course Builder tool (hub id: course-builder)
│   │   ├── agents/                 ← Per-tool agent docs (e.g. course-builder-mvp-spec.md)
│   │   ├── api/chat.ts             ← AI route: re-exports @workspace/ai-client/vercel
│   │   ├── supabase/migrations/    ← Apply in order (001–024+); schema.sql is a convenience dump
│   │   └── …                       Local Vite port 5176; RTL Hebrew authoring + review tool.
│   │                                   react-router SPA + supabase-js (VITE_SUPABASE_* env) + dnd-kit.
│   │                                   SPA rewrite in vercel.json for deep links. Uses @workspace/mbz-parser.
│   │
│   ├── mbz-explorer/               ← MBZ Explorer (hub-hosted at /mbz-explorer; no separate Vercel)
│   │   ├── agents/                 ← Per-tool agent docs
│   │   ├── api/chat.ts             ← AI route: re-exports @workspace/ai-client/vercel
│   │   └── …                       Local Vite port 5177; uses @workspace/mbz-parser
│   │
│   ├── tau-support/                ← TAU Support (hub id: tau-support; port 5178)
│   │   ├── supabase/migrations/    ← 001–012 live-verified (see agents/workspace/security.md)
│   │   └── …                       Own Supabase + Vercel; forum + info-docs RAG + question dashboard
│   │
│   ├── virtual-support/            ← Virtual Support (hub id: virtual-support; port 5180)
│   │   ├── agents/README.md
│   │   ├── api/{chat,data,ask}.ts  ← Platform-auth BFF; Ask is server-side RAG
│   │   ├── server/                 ← dataHandler, askHandler, embedCore, chunking
│   │   ├── supabase/migrations/    ← 001–004 expected (live not MCP-verified; see security.md)
│   │   └── …                       Own Supabase + Vercel; folders + docs + Ask
│   │
│   ├── dictionary-tool/            ← Dictionary Tool (hub-hosted at /dictionary-tool; no separate Vercel)
│   │   ├── agents/                 ← Per-tool agent docs + Moodle XML fixture
│   │   └── …                       Local Vite port 5179 — Excel glossary → Moodle XML (client-side)
│   │
│   ├── drupal-tool/                ← Drupal Helper (hub-hosted at /drupal-tool; no separate Vercel)
│   │   ├── agents/                 ← mvp-spec.md (scaffold; beta)
│   │   └── …                       Local Vite port 5181 — component bank + image generator (planned)
│   │
│   └── (hub only) video-transcriber ← Guide page at /video-transcriber (no apps/video-transcriber package)
│                                       SharePoint install steps; entitlement id video-transcriber
│
│   Local Vite ports (strict): hub 5173 · video-curator 5174 · tool-starter 5175 · course-builder 5176 · mbz-explorer 5177 · tau-support 5178 · dictionary-tool 5179 · virtual-support 5180 · drupal-tool 5181
│   Hub lists live/beta/coming-soon tools (not tool-starter). DEV → each tool’s `devUrl`; production → `url`. Hub-hosted tools use `hubPath`.
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
│   ├── auth/                       ← Platform Auth (session, handoff, entitlements, ADMIN_GROUP_SLUG)
│   ├── ai-client/                  ← Shared AI API wrapper
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts            ← Re-exports legacy callAI/prompt
│   │       ├── client.ts           ← Browser-safe: useAI/aiChat → /api/chat (no key/SDK)
│   │       └── server.ts           ← Serverless handler: only place with OpenAI SDK + OPENAI_API_KEY
│   ├── mbz-parser/                 ← Moodle .mbz read/write (hub rebuilds when this changes)
│   └── dev-api/                    ← Dev-only: vercelApiPlugin serves api/*.ts under vite dev
│
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── .env.example
```

