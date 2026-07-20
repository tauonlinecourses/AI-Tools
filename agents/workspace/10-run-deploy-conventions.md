<!-- AGENT DOC: Run, deploy, add tools & design rules -->
<!-- Topic: pnpm scripts, Vercel, adding tools, design rules -->
<!-- Part of: agents/workspace/ — start at README.md -->

> **Agents:** Read [README.md](./README.md) first for the full map. This file is **part 10 of 10**.
>
> ← Previous: [09-apps-tool-starter.md](./09-apps-tool-starter.md)
> → Next: *(end)*

---

## Step 7 — Run It

```bash
# Install all dependencies across all packages and apps
pnpm install

# Run everything in parallel (hub + all tools)
pnpm dev

# Run only the hub
pnpm --filter hub dev

# Run only one tool
pnpm --filter tool-starter dev

# Build everything
pnpm build
```

---

## Step 8 — Deploy to Vercel

Create one Vercel project per app. For each app:

1. Go to vercel.com → New Project → Import your Git repo
2. Set **Root Directory** to `apps/hub` (or `apps/tool-name`)
3. Prefer putting install/build/output in that app’s `vercel.json` (copy from `apps/tool-starter/vercel.json` and change the `--filter` name):
   - **Install Command:** `cd ../.. && pnpm install`
   - **Build Command:** `cd ../.. && pnpm build --filter <app-name>`
   - **Output Directory:** `dist`
4. Ensure **Include source files outside of the Root Directory in the Build Step** is enabled (needed for `packages/*`)
5. Prefer a **team Shared** `OPENAI_API_KEY` (exact name; server-side — not `VITE_*`). Create it once under Team Settings → Environment Variables, then **Link to Projects** for each app that calls OpenAI (every app's `/api/chat`). Enable Production (and Preview if needed). After linking or changing env vars, **Redeploy** — existing deployments do not pick them up. Do not also add a project-level `OPENAI_API_KEY` unless you intend to override Shared (“Overridden by Project” means the project value wins).
6. Deploy — confirm the new project is linked to the shared key (Team Settings → Shared env → linked projects)

Each app’s `vercel.json` includes an `ignoreCommand` so builds still run when `packages/ui`, `packages/config`, or `packages/ai-client` change (Vercel Root Directory alone would otherwise skip those commits). After changing Hub nav URLs in `packages/ui/src/hub.ts`, redeploy every tool app (or push a commit that touches that app / shared packages).

Shared packages are referenced with `file:../../packages/...` (not `workspace:*`) so Vercel’s occasional `npm install` for serverless functions still works — no Corepack env var needed per project.

**Vercel `api/` TypeScript rules:** Vercel typechecks serverless files with NodeNext (not the Vite `bundler` tsconfig). Handlers must import `VercelRequest` / `VercelResponse` from `@vercel/node` (add it as a devDependency) and may need `/// <reference types="node" />`. Relative ESM imports need an explicit `.js` extension (e.g. `from '../server/foo.js'` even when the source file is `.ts`). Catch blocks should narrow `unknown` with `instanceof Error` before reading `.message`.

Repeat for each tool. Each gets its own URL like `hub.vercel.app`, `tool-auth.vercel.app`, etc.

After deploying, update `apps/hub/src/tools.config.ts` with the real Vercel tool URLs. `HUB_PROD_URL` in `packages/ui/src/hub.ts` is already set to the live hub (`https://ai-tools-tauonline.vercel.app`); override per app with `VITE_HUB_URL` if the public domain differs.

---

## How to Add a New Tool

1. Copy `apps/tool-starter/` to `apps/tool-myname/`
2. In the copy, rename `"name": "tool-starter"` in `package.json` to `"name": "tool-myname"`
3. Assign a free local Vite port in `vite.config.ts` (hub 5173, video-curator 5174, tool-starter 5175 — pick the next free one)
4. Edit `apps/tool-myname/src/App.tsx` to build the tool
5. Add an entry to `apps/hub/src/tools.config.ts` with both `url` (Vercel) and `devUrl` (`http://localhost:<port>`)
6. Create a new Vercel project pointing to `apps/tool-myname`
7. Link the team shared `OPENAI_API_KEY` to the new project: Team Settings → Environment Variables → edit shared `OPENAI_API_KEY` → **Link to Projects** → add the new project → Redeploy. Do not recreate the key as a project-level var (that overrides Shared).
8. Update the `url` field in `tools.config.ts` with the live Vercel URL

---

## Design Rules (For All Tools)

These rules are mirrored from Video Curator (`apps/video-curator`) and must be respected in every app:

**Mode:** Light mode only. Do not add dark-mode themes or `.dark` body styles.

**Colors:** Always use tokens from `packages/config/tailwind.base.ts`. Primary actions match Video Curator exactly: `bg-black text-white hover:bg-gray-900` (also available as `brand-500` / `brand-600`). Use `surface-*` or Tailwind `gray-*` for chrome/text/borders. Semantic colors (`success`, `danger`, etc.) only for status. Use `accent.*` for categorical data (section spines, charts) — same palette as Video Curator `SECTION_COLORS`. Never use purple as a brand/primary color.

**Typography:** System sans-serif only (`font-body` / `font-display`). Use `text-sm` for body and UI labels, `text-xs` for hints and metadata, `font-semibold` for labels and primary buttons. Prefer `tracking-tight` on page titles. Avoid custom webfonts (no Inter / JetBrains Mono).

**Spacing:** Stick to the 4px grid. Use `gap-4` or `gap-6` between major sections, `gap-3` within a card, `gap-1.5` between a label and its input.

**Borders and radius:** Sharp corners by default — do not use Tailwind `rounded*` utilities except:
- `rounded-control` (`6px`) for buttons, tabs, upload cards, badges
- `rounded-timeline` (`3px`) for timeline / editing-software chrome
- `rounded-full` for spinners only

Cards and panels are square with `border border-surface-200`. Active/uploaded states use `border-surface-900` or `border-black` with `bg-surface-50`. Disabled controls use `border-surface-200 bg-surface-50 text-surface-500`.

**Shadows / effects:** No gradients. No heavy shadows (`shadow-*` tokens are `none`). Hover feedback is border/background contrast, not elevation.

**Icons:** Never use emojis anywhere in the UI (labels, cards, buttons, empty states, status, docs screenshots of the product UI, etc.). Use black-and-white icons only — monochrome SVG (or equivalent) that inherit `currentColor` / black–white–gray tokens. No colored icons, no emoji-as-icon shortcuts.

**The `PageLayout` component is mandatory.** Every tool must use it. It provides the top nav bar with the Hub link and ensures visual consistency across tools. Full-bleed tools (e.g. Video Curator) should pass `maxWidth="full"` and `padded={false}`.

**AI loading states:** Always show a `Spinner` while waiting for the AI. Always show errors in a red-tinted `Card`. Never leave the UI in a silent broken state.

