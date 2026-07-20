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
# Copy this to .env.local in each app that needs it (local dev only)
VITE_OPENAI_API_KEY=your_openai_key_here

# Preferred for video-curator local Vite proxy (/api/segment-transcript) and Vercel
# OPENAI_API_KEY=your_openai_key_here
#
# video-curator reads (in order): OPENAI_API_KEY → VITE_OPENAI_API_KEY → VITE_OPENAI_KEY
# Restart `pnpm run dev` after changing .env.local — Vite loads keys at server start.
```

**Video Curator segmentation errors:** `segmentTranscript` returns `errorMessage` when the OpenAI proxy fails or when model output cannot be validated (equal-chunk fallback). Repaired partial AI ranges are not treated as a connection failure. The yellow banner in the right panel shows that message so API-key / network issues are distinguishable from validation fallback.

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

