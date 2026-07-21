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
    "type-check": "turbo type-check"
  },
  "devDependencies": {
    "turbo": "^2.0.0"
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
    "type-check": {}
  }
}
```

Create `.env.example` at root:

```env
# Server-side only — never expose to the client, never prefix with NEXT_PUBLIC_
# Local dev: copy to apps/platform/.env.local
# Production: linked from the Vercel team-shared OPENAI_API_KEY
OPENAI_API_KEY=your_openai_key_here
```

> Local dev: `pnpm --filter platform dev` reads `OPENAI_API_KEY` from `apps/platform/.env.local`. Restart the dev server after editing.

**Video Curator segmentation:** [`segmentTranscript`](../../apps/platform/app/tools/video-curator/lib/segmentTranscript.ts) calls `completeViaGateway` from `@workspace/ai-client` (POST `/api/ai`). It returns `errorMessage` when the AI request fails or model output cannot be validated (equal-chunk fallback). The yellow banner in the right panel shows that message.

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

