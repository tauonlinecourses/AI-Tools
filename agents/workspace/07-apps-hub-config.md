<!-- AGENT DOC: Step 5a — apps/hub config & tools list -->
<!-- Topic: hub package, Vite, tools.config.ts -->
<!-- Part of: agents/workspace/ — start at README.md -->

> **Agents:** Read [README.md](./README.md) first for the full map. This file is **part 7 of 10**.
>
> ← Previous: [06-packages-ai-client.md](./06-packages-ai-client.md)
> → Next: [08-apps-hub-ui.md](./08-apps-hub-ui.md)

---

## Step 5a — Build `apps/hub` (config & tools list)

Hub launcher wiring. UI continues in [08-apps-hub-ui.md](./08-apps-hub-ui.md).

### `apps/hub/package.json`

```json
{
  "name": "hub",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev":        "vite",
    "build":      "tsc && vite build",
    "lint":       "eslint . --ext ts,tsx",
    "type-check": "tsc --noEmit",
    "preview":    "vite preview"
  },
  "dependencies": {
    "@workspace/ui":     "file:../../packages/ui",
    "react":             "^18.2.0",
    "react-dom":         "^18.2.0"
  },
  "devDependencies": {
    "@workspace/config": "file:../../packages/config",
    "@types/react":      "^18.2.0",
    "@types/react-dom":  "^18.2.0",
    "@vitejs/plugin-react": "^4.0.0",
    "autoprefixer":      "^10.4.0",
    "postcss":           "^8.4.0",
    "tailwindcss":       "^3.4.0",
    "typescript":        "^5.0.0",
    "vite":              "^5.0.0"
  }
}
```

### `apps/hub/tailwind.config.ts`

```typescript
import type { Config } from "tailwindcss";
import baseConfig from "@workspace/config/tailwind";

const config: Config = {
  ...baseConfig,
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",  // include shared components
  ],
};

export default config;
```

### `apps/hub/vite.config.ts`

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
});
```

### `apps/hub/index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tools Hub</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### `apps/hub/src/main.tsx`

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

### `apps/hub/src/tools.config.ts`

This is the single file you edit to add or remove tools from the hub. Add a new entry here whenever you create a new tool.

Each tool needs both a production `url` (Vercel) and a `devUrl` (local Vite). `toolHref()` picks localhost when the hub is running via `vite` DEV, and the Vercel URL when the hub is built/deployed (Vercel mode).

```typescript
export interface Tool {
  id:          string;
  name:        string;
  description: string;
  url:         string;       // Full Vercel URL (production / Vercel deploy)
  devUrl:      string;       // Local Vite URL when hub runs in `vite` DEV
  icon:        string;       // Black-and-white icon name (never emoji)
  status:      "live" | "beta" | "coming-soon";
  category:    string;
}

/** Hub DEV → localhost tool; production/Vercel build → live URL. */
export function toolHref(tool: Tool): string {
  return import.meta.env.DEV ? tool.devUrl : tool.url;
}

export const tools: Tool[] = [
  // ── Add your tools here ─────────────────────────────────────────────
  {
    id:          "tool-starter",
    name:        "Starter Tool",
    description: "Use this template to create new tools",
    url:         "https://tool-starter.vercel.app",
    devUrl:      "http://localhost:5175",
    icon:        "bolt",
    status:      "beta",
    category:    "General",
  },
  {
    id:          "video-curator",
    name:        "Video Curator",
    description: "Curate video transcripts into sections, then export clips, SRT, and PDF.",
    url:         "https://ai-tools-video-curator.vercel.app",
    devUrl:      "http://localhost:5174",
    icon:        "film",
    status:      "live",
    category:    "Video",
  },
  // ── Example entries (fill in real URLs after deploying) ─────────────
  // {
  //   id:          "tool-auth",
  //   name:        "Auth Scanner",
  //   description: "AI-powered trading card authentication.",
  //   url:         "https://tool-auth.vercel.app",
  //   devUrl:      "http://localhost:5176",
  //   icon:        "search",
  //   status:      "live",
  //   category:    "TruLux",
  // },
];

export const categories = [...new Set(tools.map((t) => t.category))];
```

