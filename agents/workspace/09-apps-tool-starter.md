<!-- AGENT DOC: Step 6 — apps/tool-starter template -->
<!-- Topic: tool template, api/chat re-export, starter App with useAI -->
<!-- Part of: agents/workspace/ — start at README.md -->

> **Agents:** Read [README.md](./README.md) first for the full map. This file is **part 9 of 10**.
>
> ← Previous: [08-apps-hub-ui.md](./08-apps-hub-ui.md)
> → Next: [10-run-deploy-conventions.md](./10-run-deploy-conventions.md)

---

## Step 6 — Build `apps/tool-starter` (Copy Template for Every New Tool)

### `apps/tool-starter/package.json`

```json
{
  "name": "tool-starter",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev":        "vite",
    "build":      "tsc && vite build",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@workspace/ui":        "file:../../packages/ui",
    "@workspace/ai-client": "file:../../packages/ai-client",
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

Serverless AI route. It is a **pass-through only** — a 1-line re-export of the shared
handler in `packages/ai-client/src/server.ts`, which is the sole place that touches the
OpenAI SDK and `OPENAI_API_KEY`. Copy this file as-is into every new tool; no changes
needed. See [06-packages-ai-client.md](./06-packages-ai-client.md) and
[secure-ai-client.md](./secure-ai-client.md).

```typescript
export { default } from "@workspace/ai-client/vercel";
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

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    strictPort: true,
  },
});
```

### `apps/tool-starter/index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tool Name</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### `apps/tool-starter/src/main.tsx`

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "@workspace/ui/styles";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

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

