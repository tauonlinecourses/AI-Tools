<!-- AGENT DOC: Step 6 — apps/tool-starter template -->
<!-- Topic: tool template, api/chat re-export, starter App with useAI -->
<!-- Part of: agents/workspace/ — start at README.md -->

> **Agents:** Read [README.md](./README.md) first for the full map. This file is **part 9 of 10**.
>
> ← Previous: [08-apps-hub-ui.md](./08-apps-hub-ui.md)
> → Next: [10-run-deploy-conventions.md](./10-run-deploy-conventions.md)

---

## Step 6 — Build `apps/tool-starter` (Copy Template for Every New Tool)

`tool-starter` is a **scaffold only** — do not list it in `apps/hub/src/tools.config.ts`. Every new tool is a copy of this folder, including `agents/`.

### `apps/tool-starter/agents/README.md`

Required on every tool. Hold tool-specific Cursor agent docs here (specs, phase flows). Monorepo-wide docs stay in repo-root `agents/workspace/`.

```markdown
# Tool agent docs

Per-tool instructions for Cursor agents. Keep tool-specific specs, flows, and conventions here.

Monorepo-wide workspace docs live in the repo root: `agents/workspace/`.

## Convention

Every tool app must include an `apps/<tool>/agents/` folder (copied from `apps/tool-starter/agents/` when scaffolding).

Suggested files:
- `README.md` — this map (what the tool does, which docs to read)
- Feature/spec docs as needed (e.g. `mvp-spec.md`, `phase-flows.md`)

After changing tool behavior, update the matching doc in this folder so it stays the source of truth for this app.
```

### `apps/tool-starter/package.json`

New tools copied from the starter also need an `eslint.config.mjs` (see [03-packages-config.md](./03-packages-config.md)). If the tool has testable pure logic, add `"test": "vitest run"`, a `vitest.config.ts`, and `src/**/*.test.ts` files (see [02-monorepo-root.md](./02-monorepo-root.md#quality-checks-lint-type-check-test-ci)).

```json
{
  "name": "tool-starter",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev":        "vite",
    "build":      "tsc && vite build",
    "type-check": "tsc --noEmit",
    "lint":       "eslint ."
  },
  "dependencies": {
    "@workspace/ui":        "file:../../packages/ui",
    "@workspace/ai-client": "file:../../packages/ai-client",
    "@workspace/auth":      "file:../../packages/auth",
    "react":                "^18.2.0",
    "react-dom":            "^18.2.0"
  },
  "devDependencies": {
    "@vercel/node":         "^3.2.0",
    "@workspace/config":    "file:../../packages/config",
    "@types/react":         "^18.2.0",
    "@types/react-dom":     "^18.2.0",
    "@vitejs/plugin-react": "^4.0.0",
    "autoprefixer":         "^10.4.0",
    "postcss":              "^8.4.0",
    "tailwindcss":          "^3.4.0",
    "typescript":           "^5.0.0",
    "vite":                 "^5.0.0"
  }
}
```

### `apps/tool-starter/api/chat.ts`

Serverless AI route. It is a **pass-through only**: Platform Auth (`withPlatformAuth`) around the
shared handler in `packages/ai-client/src/server.ts`, which is the sole place that touches the
OpenAI SDK and `OPENAI_API_KEY`. Copy this file into every new tool and change only `TOOL_ID`.
See [06-packages-ai-client.md](./06-packages-ai-client.md) and
[secure-ai-client.md](./secure-ai-client.md).

```typescript
/// <reference types="node" />
import vercelHandler from "@workspace/ai-client/vercel";
import { withPlatformAuth } from "@workspace/auth/server";

const TOOL_ID = "your-tool-id";

export default withPlatformAuth(vercelHandler, { toolId: TOOL_ID });
```

### `apps/tool-starter/tailwind.config.ts`

```typescript
import type { Config } from "tailwindcss";
import baseConfig from "@workspace/config/tailwind";

const config: Config = {
  ...baseConfig,
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
};

export default config;
```

### `apps/tool-starter/vite.config.ts`

`vercelApiPlugin` serves `api/*.ts` (here `/api/chat`) under `vite dev`; `PLATFORM_ENV` bridges
`PLATFORM_SUPABASE_*` (with `VITE_PLATFORM_*` fallbacks) and `OPENAI_API_KEY` into `process.env`.
Add app-specific keys to `bridge` when new handlers read them (see
[10-run-deploy-conventions.md](./10-run-deploy-conventions.md#local-api-under-vite-dev-packagesdev-api)).

```typescript
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { PLATFORM_ENV, vercelApiPlugin } from "../../packages/dev-api/src/index";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), vercelApiPlugin({ env, bridge: PLATFORM_ENV })],
    // Force a single React copy across workspace packages (avoids React error #525).
    resolve: {
      dedupe: ["react", "react-dom"],
    },
    server: {
      port: 5175,
      strictPort: true,
    },
  };
});
```

### `apps/tool-starter/index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tool Name</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Keep `public/favicon.png` in sync with `apps/hub/public/favicon.png` (shared brand favicon for hub + all tools).

### `apps/tool-starter/src/main.tsx`

Wrap the app in `ToolAuthGate` with the same `toolId` as in `apps/hub/src/tools.config.ts`. Direct links: unsigned → hub login; signed-in without entitlement → hub home.

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "@workspace/ui/styles";
import { ToolAuthGate } from "@workspace/auth/ToolAuthGate";
import App from "./App";

// Replace `your-tool-id` with the same id used in apps/hub/src/tools.config.ts
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ToolAuthGate toolId="your-tool-id">
      <App />
    </ToolAuthGate>
  </React.StrictMode>
);
```

Also add `"@workspace/auth": "workspace:*"` to `dependencies` in `package.json`.

### `apps/tool-starter/src/App.tsx`

```tsx
import { useState } from "react";
import { PageLayout, Card, Button, Input, Spinner } from "@workspace/ui";
import { useAI } from "@workspace/ai-client/client";

// ─── Replace everything below this line with your tool's actual UI ────────────

export default function App() {
  const [userInput, setUserInput] = useState("");
  const [result, setResult]       = useState<string | null>(null);
  const { ask, loading, error }   = useAI();

  async function handleSubmit() {
    if (!userInput.trim()) return;
    setResult(null);

    const response = await ask({
      messages: [{ role: "user", content: userInput }],
      systemPrompt: "You are a helpful assistant.",
    });

    if (response) {
      setResult(response);
    }
  }

  return (
    <PageLayout
      toolName="Starter Tool"
      toolDescription="Use this template to create new tools"
    >
      <div className="flex flex-col gap-6 max-w-2xl">
        <Card>
          <div className="flex flex-col gap-4">
            <Input
              label="Your prompt"
              placeholder="Type something..."
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
            <Button
              onClick={handleSubmit}
              loading={loading}
              disabled={!userInput.trim()}
            >
              Submit
            </Button>
          </div>
        </Card>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-surface-500">
            <Spinner size="sm" />
            Thinking...
          </div>
        )}

        {error && (
          <Card className="border-red-200 bg-red-50">
            <p className="text-sm text-danger">{error}</p>
          </Card>
        )}

        {result && (
          <Card>
            <p className="text-sm text-surface-800 whitespace-pre-wrap leading-relaxed">
              {result}
            </p>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}
```

