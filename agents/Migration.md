# AI-Tools Platform Migration Plan

**Goal:** Restructure the AI-Tools monorepo from multiple independent Vite apps into a single Next.js (App Router) platform where each tool is a route. One Vercel project, one server-side AI gateway, per-tool AI configuration, and a repeatable "add a tool" recipe that AI coding agents can execute.

**Branch:** all work happens on `restructure/nextjs-platform`. The existing apps must keep working on `main` until the merge.

---

## 1. Why we are doing this

The current structure (one Vercel project per tool, per-app ports, per-app env linking) does not scale to a ~50-person team:

- Adding a tool requires 8 manual steps (new Vercel project, port allocation, vercel.json, key linking, URL registration).
- There is no single server layer to later attach auth (Supabase), per-user usage logging, or rate limiting.
- Cross-tool navigation and shared state are awkward across separate deployments.

**Target state:**

- One Next.js app (`apps/platform`) deployed as one Vercel project.
- The hub is the root page, rendered from a central `tools.config.ts` registry.
- Each tool is a self-contained folder under `app/tools/<tool-name>/`.
- All AI calls go through one server gateway (`app/api/ai/route.ts`) using the Vercel AI SDK. The API key exists ONLY there.
- Each tool declares its own model, system prompt, temperature, and rules in a local `ai.config.ts`. The gateway reads it from a registry.
- Adding a tool = copy the `_starter` folder + one registry entry. No Vercel or env work.

---

## 2. Target repository structure

```
AI-Tools/
├── apps/
│   └── platform/                      ← THE app (only app after migration)
│       ├── app/
│       │   ├── layout.tsx             ← root layout, imports shared PageLayout chrome
│       │   ├── page.tsx               ← the hub (tool launcher grid)
│       │   ├── api/
│       │   │   └── ai/
│       │   │       └── route.ts       ← single AI gateway (only file touching the key)
│       │   └── tools/
│       │       ├── _starter/          ← template folder for new tools (underscore = not routed)
│       │       │   ├── page.tsx
│       │       │   ├── ai.config.ts
│       │       │   ├── components/
│       │       │   └── lib/
│       │       └── video-curator/     ← migrated existing tool
│       │           ├── page.tsx
│       │           ├── ai.config.ts
│       │           ├── components/
│       │           ├── hooks/
│       │           └── lib/
│       ├── agents/                    ← centralized AI logic
│       │   ├── registry.ts            ← maps toolId → ai.config (imports each tool's config)
│       │   └── types.ts               ← ToolAIConfig type
│       ├── lib/
│       │   └── tools.config.ts        ← tool registry: id, name, description, icon, path
│       ├── next.config.ts
│       ├── tailwind.config.ts         ← extends packages/config tailwind preset
│       ├── tsconfig.json              ← extends packages/config tsconfig
│       └── package.json
├── packages/
│   ├── ui/                            ← KEEP — shared React components (PageLayout etc.)
│   ├── config/                        ← KEEP — shared Tailwind / TS / ESLint configs
│   └── ai-client/                     ← REPURPOSE — thin typed client for OUR /api/ai
│                                        (React hooks wrapping Vercel AI SDK useChat, no OpenAI code)
├── agents/                            ← KEEP — Cursor agent instructions (update content, see §7)
├── turbo.json                         ← update pipeline for the new app
├── pnpm-workspace.yaml                ← unchanged
├── .env.example                       ← simplify (see §6)
└── README.md                          ← rewrite (see §7)
```

**Deleted at the end (step 5 only, after platform verified):** `apps/hub`, `apps/video-curator`, `apps/tool-starter`, all per-app `vercel.json` files.

---

## 3. Key implementation details

### 3.1 The AI gateway — `app/api/ai/route.ts`

- Use the **Vercel AI SDK** (`ai` package) with `@ai-sdk/openai`.
- The route receives `{ toolId, messages }` (plus optional per-request overrides if a tool needs them).
- It looks up the tool's config via `agents/registry.ts` and executes `streamText` with the tool's model, system prompt, and temperature.
- Return `toDataStreamResponse()` so client hooks stream out of the box.
- Reject unknown `toolId` values with a 400.
- `OPENAI_API_KEY` (server-side, NO `VITE_`/`NEXT_PUBLIC_` prefix) is read only here via the SDK default.
- Leave clearly marked placeholder comments where auth, usage logging, and rate limiting will be added later:

```ts
// FUTURE: auth check (Supabase) goes here
// FUTURE: per-user usage logging goes here
// FUTURE: rate limiting goes here
```

### 3.2 Per-tool AI config — `ai.config.ts`

Each tool folder contains:

```ts
import type { ToolAIConfig } from "@/agents/types";

export const config = {
  toolId: "video-curator",
  model: "gpt-4o-mini",        // any model string the gateway's provider supports
  temperature: 0.3,
  system: `You are a video transcript analyst. Rules: ...`,
} satisfies ToolAIConfig;
```

`agents/registry.ts` imports every tool's config and exposes `getToolConfig(toolId)`. When a tool is added, its config import is added to the registry (one line).

### 3.3 The tool registry — `lib/tools.config.ts`

Single source of truth for the hub:

```ts
export const tools = [
  {
    id: "video-curator",
    name: "Video Curator",
    description: "Curate video transcripts and export clips",
    path: "/tools/video-curator",
    icon: "video",              // key into a small icon map, or a lucide icon name
  },
];
```

No `devUrl`, no `url`, no ports — routes replace all of it.

### 3.4 Tool pages

- Each `page.tsx` starts with `"use client"` and wraps content in the shared `PageLayout` from `@repo/ui` (keep the existing import name used in the repo).
- Client-side AI calls use the repurposed `packages/ai-client`, which wraps the AI SDK's `useChat` / `useCompletion` pointed at `/api/ai` and automatically injects the tool's `toolId`.
- Tools may add `actions.ts` (server actions) for non-chat work (file processing etc.). Server actions may also call the shared gateway logic — never OpenAI directly.

### 3.5 The `_starter` template

A minimal working tool: a `page.tsx` with `PageLayout`, an input, a streamed AI response using the shared client hook, and a filled-in `ai.config.ts`. The underscore prefix keeps it out of routing. It must compile.

---

## 4. Migration steps (execute in order)

**Step 1 — Scaffold the platform app.**
Create `apps/platform` with Next.js 15+ (App Router, TypeScript, Tailwind). Wire it into the pnpm workspace and `turbo.json` (`dev`, `build`, `lint`, `type-check`). Reuse `packages/config` presets. Do not touch the existing apps.

**Step 2 — Build the core skeleton.**
Root layout with shared chrome, hub page rendering from `lib/tools.config.ts`, `agents/types.ts`, `agents/registry.ts` (empty registry is fine at this point), and the AI gateway route with the Vercel AI SDK. Add `ai` and `@ai-sdk/openai` dependencies. Create the `_starter` tool and verify it streams a response locally (requires `OPENAI_API_KEY` in `apps/platform/.env.local`).

**Step 3 — Port video-curator.**
Move `apps/video-curator/src` content into `app/tools/video-curator/` following the folder structure in §2. Extract its current model/prompt/rules from the existing client/server code into `ai.config.ts`. Replace its existing AI-calling code with the shared client hook hitting `/api/ai`. Register it in both `lib/tools.config.ts` and `agents/registry.ts`. Port the existing server-side AI handler logic INTO the gateway pattern — the old proxy server is retired.

**Step 4 — Repurpose `packages/ai-client`.**
Remove all direct OpenAI code. Export typed React hooks (`useToolChat(toolId)` etc.) wrapping the AI SDK client hooks with the endpoint and toolId prewired. Update video-curator and `_starter` to consume it.

**Step 5 — Cleanup (ONLY after video-curator works inside the platform).**
Delete `apps/hub`, `apps/video-curator`, `apps/tool-starter` and their `vercel.json` files. Update `.env.example` and `README.md` (see §6–7). Run `pnpm lint` and `pnpm type-check` clean.

**Verification checklist before merge:**

- [ ] `pnpm dev` serves the platform; hub lists video-curator and the starter is not routed
- [ ] Video-curator works end-to-end, streaming through `/api/ai`
- [ ] No `VITE_` or `NEXT_PUBLIC_` AI key anywhere; key referenced only by the gateway
- [ ] `pnpm build`, `pnpm lint`, `pnpm type-check` all pass
- [ ] Grep confirms zero direct `openai` imports outside `app/api/ai/` and `agents/`

---

## 5. Vercel changes (manual, done by Amir after merge — NOT by the agent)

1. Create ONE new Vercel project pointing at the repo, Root Directory: `apps/platform`. Framework auto-detects Next.js; no custom build settings needed.
2. Link the existing team-shared `OPENAI_API_KEY` to this project (Production + Preview).
3. Verify the deployment, then delete the old hub / video-curator / tool-starter Vercel projects.

---

## 6. New `.env.example`

```
# Server-side only — never expose to the client, never prefix with NEXT_PUBLIC_
# Local dev: copy to apps/platform/.env.local
# Production: linked from the Vercel team-shared OPENAI_API_KEY
OPENAI_API_KEY=your_openai_key_here
```

---

## 7. New "Add a tool" recipe (this replaces the old 8-step README section)

1. Copy `app/tools/_starter/` → `app/tools/<tool-name>/`
2. Edit `ai.config.ts` (toolId, model, system prompt, rules) and build the UI in `page.tsx`
3. Add one entry to `lib/tools.config.ts` and one import line to `agents/registry.ts`
4. Done — it deploys with the platform on the next push

Update `README.md` to describe the new structure (§2), this recipe, and the gateway pattern. Update the `agents/` instruction files so Cursor agents follow the new recipe and NEVER call OpenAI directly from tool code.

---

## 8. Rules for the implementing agent

- Work only on branch `restructure/nextjs-platform`.
- Do not delete anything until Step 5, and only after Step 3–4 verification passes.
- Preserve the existing design language: reuse `packages/ui` components and `packages/config` presets rather than restyling.
- Tools import from shared packages; tools never import from other tools.
- Everything a tool owns lives in its folder. Shared-by-two rule: if two tools need it, move it up to `packages/`.
- Keep commits small and per-step (one commit per migration step minimum).
- If a decision is ambiguous (e.g., a video-curator dependency that doesn't fit the new structure), stop and ask rather than guessing.