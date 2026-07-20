<!-- AGENT DOC: Step 2 — Build packages/config -->
<!-- Topic: design tokens, tsconfig, Tailwind base -->
<!-- Part of: agents/workspace/ — start at README.md -->

> **Agents:** Read [README.md](./README.md) first for the full map. This file is **part 3 of 10**.
>
> ← Previous: [02-monorepo-root.md](./02-monorepo-root.md)
> → Next: [04-packages-ui-basics.md](./04-packages-ui-basics.md)

---

## Step 2 — Build `packages/config`

This package owns all design tokens and shared configs. Everything visual derives from here.

### `packages/config/package.json`

```json
{
  "name": "@workspace/config",
  "version": "0.0.1",
  "private": true,
  "main": "./tailwind.base.ts",
  "exports": {
    "./tailwind": "./tailwind.base.ts",
    "./tsconfig": "./tsconfig.base.json"
  }
}
```

### `packages/config/tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### `packages/config/tailwind.base.ts`

This is the design system. All colors, fonts, and spacing are defined here. Every app imports this config and extends it.

**Source of truth:** mirrored from Video Curator (`apps/video-curator`) design constraints (light mode, system sans, high-contrast black/gray, sharp corners, no heavy shadows).

```typescript
import type { Config } from "tailwindcss";

/**
 * Design tokens — mirrored from Video Curator (`apps/video-curator`).
 *
 * Rules:
 * - Light mode only
 * - System sans-serif
 * - Minimal UI, high contrast (black / white / gray)
 * - No gradients, no heavy shadows
 * - No rounded corners by default (use `rounded-control` / `rounded-timeline` only where documented)
 */
const config: Omit<Config, "content"> = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Brand = high-contrast black primary
        brand: {
          50:  "#f9fafb",
          100: "#f3f4f6",
          200: "#e5e7eb",
          300: "#d1d5db",
          400: "#9ca3af",
          500: "#000000", // Primary action fill
          600: "#111827", // hover
          700: "#030712", // active
          800: "#111827",
          900: "#111827",
          950: "#030712",
        },
        // Neutral — Tailwind gray scale
        surface: {
          0:   "#ffffff",
          50:  "#f9fafb",
          100: "#f3f4f6",
          200: "#e5e7eb",
          300: "#d1d5db",
          400: "#9ca3af",
          500: "#6b7280",
          600: "#4b5563",
          700: "#374151",
          800: "#1f2937",
          900: "#111827",
          950: "#030712",
        },
        success: "#10b981",
        warning: "#f59e0b",
        danger:  "#ef4444",
        info:    "#3b82f6",
        // Categorical accents (Video Curator SECTION_COLORS)
        accent: {
          red:    "#EF4444",
          blue:   "#3B82F6",
          amber:  "#F59E0B",
          green:  "#10B981",
          purple: "#8B5CF6",
          pink:   "#EC4899",
          cyan:   "#06B6D4",
          orange: "#F97316",
        },
      },
      fontFamily: {
        display: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        body:    ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        mono:    ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
        xs:   ["0.75rem",  { lineHeight: "1rem" }],
        sm:   ["0.875rem", { lineHeight: "1.25rem" }],
        base: ["1rem",     { lineHeight: "1.5rem" }],
        lg:   ["1.125rem", { lineHeight: "1.75rem" }],
        xl:   ["1.25rem",  { lineHeight: "1.75rem" }],
        "2xl":["1.5rem",   { lineHeight: "2rem" }],
        "3xl":["1.875rem", { lineHeight: "2.25rem" }],
        "4xl":["2.25rem",  { lineHeight: "2.5rem" }],
      },
      borderRadius: {
        none:     "0",
        sm:       "0",
        DEFAULT:  "0",
        md:       "0",
        lg:       "0",
        xl:       "0",
        "2xl":    "0",
        "3xl":    "0",
        control:  "6px", // buttons, tabs, upload cards, badges
        timeline: "3px", // timeline / editing-software chrome
        full:     "9999px", // spinners only
      },
      boxShadow: {
        sm:   "none",
        md:   "none",
        lg:   "none",
        xl:   "none",
        none: "none",
        glow: "0 0 0 2px #000000",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      transitionDuration: {
        fast:   "100ms",
        normal: "150ms",
        slow:   "250ms",
      },
    },
  },
  plugins: [],
};

export default config;
```

