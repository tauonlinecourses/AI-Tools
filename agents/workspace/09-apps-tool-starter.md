<!-- AGENT DOC: Step 6 — apps/tool-starter template -->
<!-- Topic: tool template, api/chat proxy, starter App -->
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

Production proxy — keeps `OPENAI_API_KEY` server-side. Local Vite uses `VITE_OPENAI_API_KEY` directly via `ai-client`.

```typescript
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
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
import React, { useState } from "react";
import { PageLayout, Card, Button, Input, Spinner } from "@workspace/ui";
import { prompt } from "@workspace/ai-client";

// ─── Replace everything below this line with your tool's actual UI ────────────

export default function App() {
  const [userInput, setUserInput] = useState("");
  const [result, setResult]       = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  async function handleSubmit() {
    if (!userInput.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const response = await prompt(userInput, {
      systemPrompt: "You are a helpful assistant.",
    });

    if (response.error) {
      setError(response.error);
    } else {
      setResult(response.text);
    }

    setLoading(false);
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

