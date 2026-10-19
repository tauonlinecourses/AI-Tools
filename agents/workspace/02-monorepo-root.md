<!-- AGENT DOC: Step 1 — Initialize the Monorepo Root -->
<!-- Topic: root package.json, pnpm-workspace, turbo.json, env, gitignore -->
<!-- Part of: agents/workspace/ — start at README.md -->

> **Agents:** Read [README.md](./README.md) first for the full map. This file is **part 2 of 10**.
>
> ← Previous: [01-overview.md](./01-overview.md)
> → Next: [03-packages-config.md](./03-packages-config.md)

---

## Step 1 — Initialize the Monorepo Root

Create the root `package.json`:

```json
{
  "name": "workspace",
  "private": true,
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "lint": "turbo lint",
    "type-check": "turbo type-check",
    "test": "turbo test"
  },
  "devDependencies": {
    "eslint": "^9.39.4",
    "turbo": "^2.0.0",
    "vitest": "^3.2.4"
  },
  "engines": {
    "node": ">=18",
    "pnpm": ">=9"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Create `turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "type-check": {},
    "test": {}
  }
}
```

### Quality checks (lint, type-check, test, CI)

Every app and package exposes the same scripts so the root `turbo` commands cover the whole repo:

| Script | Command | Notes |
|---|---|---|
| `type-check` | `tsc --noEmit` (video-curator: `tsc -b`) | All workspaces, including `packages/ui`, `auth`, `ai-client` |
| `lint` | `eslint .` | Each workspace has `eslint.config.mjs` → `createConfig()` from `@workspace/config/eslint` |
| `test` | `vitest run` | Only workspaces with tests: `packages/auth`, `packages/ai-client`, `course-builder`, `tau-support`, `video-curator` |

- `eslint` and `vitest` are installed once at the root; plugins live in `packages/config`.
- Tests live next to the code as `src/**/*.test.ts`. Each tested workspace has its own `vitest.config.ts` so Vitest does **not** load the dev-API middleware in `vite.config.ts`. Mock modules that create a Supabase client at import time (`vi.mock("./supabase")`).
- Lint warnings do not fail the run; errors do. Use `// eslint-disable-next-line <rule>` only for intentional patterns (for example control-character regexes that strip null bytes).
- No Prettier: apps currently use different quote/semicolon styles, and a repo-wide reformat is a separate decision.
- CI: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) runs on pushes to `main` and on PRs: `pnpm install --frozen-lockfile` → `type-check` → `lint` → `test` → `build`. After adding a dependency, commit the updated `pnpm-lock.yaml` or CI fails.

Create `.env.example` at root. The key must **never** be prefixed with `VITE_` — that
would expose it in the browser bundle. All AI calls go through serverless `api/chat.ts`
(see [06-packages-ai-client.md](./06-packages-ai-client.md) and
[secure-ai-client.md](./secure-ai-client.md)):

```env
# Used by Vercel serverless functions (api/chat.ts) and local vercel dev.
# This key must NEVER be prefixed with VITE_ — that would expose it in the browser bundle.
OPENAI_API_KEY=your_openai_key_here

# Production (Vercel): use one team Shared OPENAI_API_KEY.
# Team Settings → Environment Variables → link shared var to each app project.
# See README.md for the full linking procedure.
```

> Local dev: `vercel dev` runs `api/chat.ts` alongside Vite and reads `OPENAI_API_KEY`
> from each app's `.env.local`. video-curator also serves `/api/chat` under plain `vite dev`
> via a local middleware in its `vite.config.ts` that delegates to the shared handler; that
> middleware bridges legacy `VITE_OPENAI_API_KEY` / `VITE_OPENAI_KEY` into `OPENAI_API_KEY`
> for convenience, but `OPENAI_API_KEY` is the only supported name going forward. Restart
> the dev server after editing `.env.local`.

**Video Curator segmentation errors:** transcript segmentation ([`segmentTranscript`](../../apps/video-curator/src/lib/segmentTranscript.ts)) now calls the shared `/api/chat` route via `aiChat` (`@workspace/ai-client/client`). It returns `errorMessage` when the AI request fails or when model output cannot be validated (equal-chunk fallback). Repaired partial AI ranges are not treated as a connection failure. The yellow banner in the right panel shows that message so API-key / network issues are distinguishable from validation fallback.

Create `.gitignore`:

```
node_modules/
dist/
.turbo/
.env.local
.env
*.log
*.tsbuildinfo
package-lock.json
```

