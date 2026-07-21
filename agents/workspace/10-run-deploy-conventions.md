<!-- AGENT DOC: Run, deploy, add tools & design rules -->
<!-- Part of: agents/workspace/ — start at README.md -->

> **Agents:** Read [README.md](./README.md) first. This file is **part 10 of 10**.

---

## Run the platform

```bash
pnpm install
cp .env.example apps/platform/.env.local   # add OPENAI_API_KEY
pnpm --filter platform dev                   # http://localhost:3000
pnpm build                                   # turbo build (platform → .next)
pnpm lint
pnpm type-check
```

---

## Deploy to Vercel

**One project** for the whole platform (manual setup by team lead):

1. New Vercel project → import repo → **Root Directory:** `apps/platform`
2. Framework auto-detects Next.js — no custom build settings needed
3. Link team-shared `OPENAI_API_KEY` (Production + Preview)
4. Deploy

See [`../Migration.md`](../Migration.md) §5 for the full checklist.

---

## How to Add a New Tool

1. Copy `apps/platform/app/tools/_starter/` → `apps/platform/app/tools/<tool-name>/`
2. Edit `ai.config.ts` (toolId, model, system prompt, temperature) and build UI in `page.tsx`
3. Add one entry to `apps/platform/lib/tools.config.ts`
4. Add one import line to `apps/platform/agents/registry.ts`
5. Push — deploys with the platform automatically

Use `useToolChat(toolId)` or `completeViaGateway({ toolId, prompt })` from `@workspace/ai-client` for AI calls. **Never** call OpenAI directly from tool code.

---

## Design Rules (For All Tools)

These rules are mirrored from Video Curator and must be respected in every tool:

**Mode:** Light mode only.

**Colors:** Use tokens from `packages/config/tailwind.base.ts`. Primary actions: `bg-black text-white hover:bg-gray-900`. Use `surface-*` for chrome. Never use purple as brand/primary.

**Typography:** System sans-serif only. `text-sm` for body, `text-xs` for hints, `font-semibold` for labels.

**Borders and radius:** Sharp by default. Use `rounded-control` (6px) for buttons/cards, `rounded-timeline` (3px) for timeline chrome, `rounded-full` for spinners only.

**Shadows:** No gradients. No heavy shadows.

**Icons:** Black-and-white SVG only — no emojis.

**PageLayout is mandatory.** Pass `hubUrl="/"` and `maxWidth="full"` / `padded={false}` for full-bleed tools like Video Curator.

**AI loading states:** Show a `Spinner` while waiting. Show errors in a visible banner/card.
