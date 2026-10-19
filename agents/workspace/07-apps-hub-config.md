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
    "react-dom":         "^18.2.0",
    "react-router-dom":  "^6"
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
<html lang="he" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>כלי בינה מלאכותית</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Favicon: `apps/hub/public/favicon.png` (same asset copied into every tool app’s `public/favicon.png`).

### `apps/hub/src/main.tsx`

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@workspace/ui/styles";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

Hub depends on `react-router-dom` (`^6`) for `/` (Hebrew, default) and `/en` (English). See [08-apps-hub-ui.md](./08-apps-hub-ui.md) for i18n + RTL.

### `apps/hub/src/tools.config.ts`

This is the single file you edit to add or remove tools from the hub. Add a new entry here whenever you create a new tool.

Standalone tools need a production `url` (Vercel) and a `devUrl` (local Vite). Hub-hosted tools (no separate Vercel project) use `hubPath` instead — e.g. MBZ Explorer at `/mbz-explorer`. `toolIsOpenable()` / card click: `hubPath` navigates in-app; otherwise hub DEV uses `devUrl` and production uses `url` via auth handoff. `findToolForReturnUrl(returnUrl)` maps a tool deep-link back to a catalog entry (origin match for `url`/`devUrl`, or path match for `hubPath`) so hub `?returnUrl=` handling never open-redirects.

```typescript
export interface Tool {
  id:          string;
  name:        string;
  description: string;
  hubPath?:    string;       // Same-origin hub route (no separate Vercel project)
  url?:        string;       // Vercel URL for standalone tool apps
  devUrl?:     string;       // Local Vite URL (standalone tools from hub DEV)
  icon:        string;
  status:      "live" | "beta" | "coming-soon";
  category:    string;
}

export const tools: Tool[] = [
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
  {
    id:          "mbz-explorer",
    name:        "MBZ Explorer",
    description: "Inspect Moodle .mbz course backups — structure, activities, and decoded content.",
    hubPath:     "/mbz-explorer",
    icon:        "zip",
    status:      "beta",
    category:    "Tech",
  },
  {
    id:          "dictionary-tool",
    name:        "Dictionary Tool",
    description: "Convert an Excel glossary into Moodle-importable XML.",
    hubPath:     "/dictionary-tool",
    icon:        "book",
    status:      "beta",
    category:    "Education",
  },
];
```



