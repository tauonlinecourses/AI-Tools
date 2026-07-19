# Tools Workspace — Build Instructions for Cursor Agent

## What You Are Building

A Turborepo monorepo containing:
- A **hub app** (`apps/hub`) — a central launcher page that links to all tools
- Multiple **tool apps** (`apps/tool-*`) — independent React apps, one per tool
- Shared **packages** — design system, UI components, and AI client used by every app

Every app deploys to Vercel independently. Every app shares the same design language via shared packages.

---

## Tech Stack

| Concern | Choice |
|---|---|
| Monorepo | Turborepo |
| Package manager | pnpm |
| Framework | React + Vite + TypeScript |
| Styling | Tailwind CSS v3 |
| Shared config | `packages/config` |
| Shared components | `packages/ui` |
| AI API wrapper | `packages/ai-client` |
| Deployment | Vercel (one project per app) |

---

## Final Directory Structure

```
workspace/
├── apps/
│   ├── hub/                        ← Launcher homepage
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   ├── tailwind.config.ts
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       └── tools.config.ts     ← List of all tools (name, url, description, icon)
│   │
│   ├── tool-starter/               ← Starter template (copy this to create any new tool)
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   ├── tailwind.config.ts
│   │   ├── api/
│   │   │   └── chat.ts             ← Production OpenAI proxy (Vercel serverless)
│   │   └── src/
│   │       ├── main.tsx
│   │       └── App.tsx
│   │
│   └── video-curator/              ← Video Curator tool (hub id: video-curator)
│       ├── api/
│       │   ├── segment-transcript.ts  ← Vercel serverless (uses @vercel/node)
│       │   └── youtube-transcript.ts  ← Vercel serverless; relative imports need `.js` (NodeNext)
│       ├── server/
│       │   └── youtubeTranscriptCore.ts
│       └── …                       Live: https://ai-video-tools-tan.vercel.app (local Vite port 5174)
│                                       Uses PageLayout (Hub nav) like tool-starter; padded={false} for full-bleed UI
│
│   Local Vite ports (strict): hub 5173 · video-curator 5174 · tool-starter 5175
│   Hub links: DEV → each tool’s `devUrl` (localhost); production/Vercel build → `url`
│
├── packages/
│   ├── config/                     ← Shared Tailwind + TypeScript + ESLint configs
│   │   ├── package.json
│   │   ├── tailwind.base.ts        ← Design tokens (colors, fonts, spacing, radii)
│   │   └── tsconfig.base.json
│   │
│   ├── ui/                         ← Shared React component library
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts            ← Exports all components
│   │       ├── components/
│   │       │   ├── Button.tsx
│   │       │   ├── Card.tsx
│   │       │   ├── Input.tsx
│   │       │   ├── Badge.tsx
│   │       │   ├── Spinner.tsx
│   │       │   └── PageLayout.tsx
│   │       └── styles/
│   │           └── globals.css     ← Base CSS resets and font imports
│   │
│   └── ai-client/                  ← Shared AI API wrapper
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           └── client.ts           ← OpenAI wrapper (dev: direct; prod: /api/chat)
│
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── .env.example
```

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

# Production (Vercel): set OPENAI_API_KEY on the server — used by /api/chat
# OPENAI_API_KEY=your_openai_key_here
```

Create `.gitignore`:

```
node_modules/
dist/
.turbo/
.env.local
.env
*.log
*.tsbuildinfo
```

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

---

## Step 3 — Build `packages/ui`

### `packages/ui/package.json`

```json
{
  "name": "@workspace/ui",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./styles": "./src/styles/globals.css"
  },
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "@workspace/config": "file:../config",
    "@types/react": "^18.0.0",
    "typescript": "^5.0.0"
  }
}
```

### `packages/ui/src/styles/globals.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    color-scheme: light;
  }

  * {
    box-sizing: border-box;
  }

  body {
    @apply bg-white text-surface-900 font-body antialiased;
  }

  /* High-contrast black focus ring — matches Video Curator */
  :focus-visible {
    @apply outline-none ring-2 ring-brand-500 ring-offset-2 ring-offset-white;
  }

  /* Scrollbar — minimal, sharp */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { @apply bg-surface-100; }
  ::-webkit-scrollbar-thumb { @apply bg-surface-300; }
  ::-webkit-scrollbar-thumb:hover { @apply bg-surface-400; }
}
```

### `packages/ui/src/components/Button.tsx`

```tsx
import React from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-black text-white hover:bg-gray-900 active:bg-black border border-black",
  secondary:
    "bg-white text-gray-900 border border-gray-900 hover:bg-gray-50 active:bg-gray-100",
  ghost:
    "bg-transparent text-gray-700 border border-transparent hover:bg-gray-50 active:bg-gray-100",
  danger:
    "bg-danger text-white border border-danger hover:opacity-90 active:opacity-80",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  lg: "h-11 px-6 text-sm gap-2.5",
};

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  loading = false,
  leftIcon,
  rightIcon,
  children,
  disabled,
  className = "",
  ...props
}) => {
  const isDisabled = disabled || loading;

  return (
    <button
      disabled={isDisabled}
      className={[
        "inline-flex items-center justify-center font-semibold rounded-control",
        "transition-colors duration-fast",
        "disabled:bg-surface-100 disabled:text-surface-500 disabled:border-surface-200 disabled:cursor-not-allowed disabled:opacity-100",
        variantStyles[variant],
        sizeStyles[size],
        className,
      ].join(" ")}
      {...props}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
};
```

### `packages/ui/src/components/Card.tsx`

```tsx
import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
  border?: boolean;
  hover?: boolean;
  onClick?: () => void;
}

const paddingStyles = {
  none: "",
  sm:   "p-3",
  md:   "p-5",
  lg:   "p-7",
};

export const Card: React.FC<CardProps> = ({
  children,
  className = "",
  padding = "md",
  border = true,
  hover = false,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={[
        "bg-white",
        border ? "border border-surface-200" : "",
        hover ? "hover:bg-surface-50 transition-colors duration-fast cursor-pointer" : "",
        paddingStyles[padding],
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
};
```

### `packages/ui/src/components/Input.tsx`

```tsx
import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftElement?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  hint,
  leftElement,
  className = "",
  id,
  ...props
}) => {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-semibold text-surface-900">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {leftElement && (
          <span className="absolute left-3 text-surface-400">{leftElement}</span>
        )}
        <input
          id={inputId}
          className={[
            "w-full h-9 px-3 text-sm",
            "bg-white border border-surface-200",
            "text-surface-900 placeholder:text-surface-400",
            "outline-none focus:border-surface-900",
            "disabled:bg-surface-50 disabled:text-surface-400 disabled:cursor-not-allowed",
            "transition-colors duration-fast",
            error ? "border-danger" : "",
            leftElement ? "pl-9" : "",
            className,
          ].join(" ")}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {hint && !error && <p className="text-xs text-surface-500">{hint}</p>}
    </div>
  );
};
```

### `packages/ui/src/components/Badge.tsx`

```tsx
import React from "react";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "brand";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: "sm" | "md";
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-surface-100 text-surface-600 border-surface-200",
  success: "bg-emerald-50 text-emerald-800 border-emerald-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  danger:  "bg-red-50 text-red-800 border-red-200",
  info:    "bg-blue-50 text-blue-800 border-blue-200",
  brand:   "bg-black text-white border-black",
};

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "default",
  size = "md",
}) => {
  return (
    <span
      className={[
        "inline-flex items-center font-medium border rounded-control",
        size === "sm" ? "px-2 py-0.5 text-2xs" : "px-2.5 py-1 text-xs",
        variantStyles[variant],
      ].join(" ")}
    >
      {children}
    </span>
  );
};
```

### `packages/ui/src/components/Spinner.tsx`

```tsx
import React from "react";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeStyles = { sm: "w-4 h-4", md: "w-6 h-6", lg: "w-8 h-8" };

export const Spinner: React.FC<SpinnerProps> = ({ size = "md", className = "" }) => (
  <div
    className={[
      "border-2 border-gray-200 border-t-black rounded-full animate-spin",
      sizeStyles[size],
      className,
    ].join(" ")}
  />
);
```

### `packages/ui/src/hub.ts`

Shared hub back-link targets used by `PageLayout` (and available to tools):

```typescript
/** Local hub (apps/hub Vite port). */
export const HUB_DEV_URL = "http://localhost:5173";

/**
 * Live hub on Vercel — update after the hub project is deployed.
 * Override per app with `VITE_HUB_URL` if needed.
 */
export const HUB_PROD_URL = "https://your-hub.vercel.app";

/** DEV → localhost hub; production/Vercel build → live hub URL. */
export function hubHref(): string {
  if (import.meta.env.DEV) return HUB_DEV_URL;
  const fromEnv = import.meta.env.VITE_HUB_URL;
  return typeof fromEnv === "string" && fromEnv.length > 0 ? fromEnv : HUB_PROD_URL;
}
```

### `packages/ui/src/components/PageLayout.tsx`

```tsx
import React from "react";
import { hubHref } from "../hub";

interface PageLayoutProps {
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
  toolName?: string;
  toolDescription?: string;
  /** Defaults to localhost in DEV and the Vercel hub URL in production. */
  hubUrl?: string;
  /** When false, content fills the area under the nav with no outer padding (for full-bleed tools). */
  padded?: boolean;
}

const maxWidthStyles = {
  sm:   "max-w-screen-sm",
  md:   "max-w-screen-md",
  lg:   "max-w-screen-lg",
  xl:   "max-w-screen-xl",
  "2xl":"max-w-screen-2xl",
  full: "max-w-full",
};

export const PageLayout: React.FC<PageLayoutProps> = ({
  children,
  maxWidth = "xl",
  toolName,
  toolDescription,
  hubUrl = hubHref(),
  padded = true,
}) => {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Top nav bar */}
      <header className="h-12 bg-white border-b border-surface-200 flex items-center px-4 shrink-0">
        <a
          href={hubUrl}
          className="text-xs text-surface-500 hover:text-surface-900 transition-colors duration-fast flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          Hub
        </a>
        {toolName && (
          <>
            <span className="mx-2 text-surface-300">/</span>
            <span className="text-sm font-semibold text-surface-900">{toolName}</span>
          </>
        )}
        {toolDescription && (
          <span className="ml-3 text-xs text-surface-500 hidden sm:block">
            {toolDescription}
          </span>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-h-0">
        <div
          className={[
            "w-full mx-auto flex-1 flex flex-col min-h-0",
            padded ? "px-4 sm:px-6 py-6" : "",
            maxWidthStyles[maxWidth],
          ].join(" ")}
        >
          {children}
        </div>
      </main>
    </div>
  );
};
```

Video Curator uses `PageLayout` with `maxWidth="full"` and `padded={false}` so the split-pane editor stays full-bleed under the Hub nav. Tools should omit `hubUrl` so the Hub back link resolves via `hubHref()` (localhost in DEV, Vercel in production).


### `packages/ui/src/index.ts`

```typescript
export { Button }      from "./components/Button";
export { Card }        from "./components/Card";
export { Input }       from "./components/Input";
export { Badge }       from "./components/Badge";
export { Spinner }     from "./components/Spinner";
export { PageLayout }  from "./components/PageLayout";
export { hubHref, HUB_DEV_URL, HUB_PROD_URL } from "./hub";
```

---

## Step 4 — Build `packages/ai-client`

### `packages/ai-client/package.json`

```json
{
  "name": "@workspace/ai-client",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

### `packages/ai-client/src/client.ts`

```typescript
export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface CallOptions {
  model?:        string;
  maxTokens?:    number;
  systemPrompt?: string;
  temperature?:  number;
}

export interface AIResponse { text: string; error: null; }
export interface AIError    { text: null;   error: string; }
export type AIResult = AIResponse | AIError;

export async function callAI(
  messages: Message[],
  options: CallOptions = {}
): Promise<AIResult> {
  const {
    model        = "gpt-4o-mini",
    maxTokens    = 2048,
    systemPrompt,
    temperature  = 0.7,
  } = options;

  const allMessages: Message[] = [
    ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
    ...messages,
  ];

  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: allMessages,
  };

  try {
    const isDev = import.meta.env.DEV;
    let response: Response;

    if (isDev) {
      const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
      if (!apiKey) return { text: null, error: "VITE_OPENAI_API_KEY is not set in .env.local" };

      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } else {
      response = await fetch("/api/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return {
        text:  null,
        error: (err as { error?: { message?: string } }).error?.message
          ?? `API error ${response.status}`,
      };
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };

    return { text: data.choices[0]?.message?.content ?? "", error: null };
  } catch (err) {
    return {
      text:  null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function prompt(
  userMessage: string,
  options: CallOptions = {}
): Promise<AIResult> {
  return callAI([{ role: "user", content: userMessage }], options);
}
```

### `packages/ai-client/src/index.ts`

```typescript
export { callAI, prompt } from "./client";
export type { Message, CallOptions, AIResult, AIResponse, AIError } from "./client";
```

---

## Step 5 — Build `apps/hub`

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
    url:         "https://ai-video-tools-tan.vercel.app",
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

### `apps/hub/src/App.tsx`

```tsx
import React, { useState } from "react";
import { Badge } from "@workspace/ui";
import { tools, categories, toolHref } from "./tools.config";
import type { Tool } from "./tools.config";

const iconPaths: Record<string, string> = {
  bolt:   "M13 10V3L4 14h7v7l9-11h-7z",
  film:   "M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z",
  search: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
};

function ToolIcon({ name }: { name: string }) {
  const d = iconPaths[name] ?? iconPaths.bolt;
  return (
    <svg
      className="w-6 h-6 text-surface-900"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={d} />
    </svg>
  );
}

function ToolCard({ tool }: { tool: Tool }) {
  const isClickable = tool.status !== "coming-soon";
  const isComingSoon = tool.status === "coming-soon";

  const card = (
    <div
      className={[
        "group bg-white border border-surface-200 p-5",
        "flex flex-col gap-3",
        "transition-colors duration-fast",
        isClickable
          ? "hover:bg-surface-50 hover:border-surface-900 cursor-pointer"
          : "opacity-60 cursor-not-allowed",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-lg font-semibold text-surface-900 truncate">
            {tool.name}
          </h3>
          {isComingSoon && (
            <Badge variant="default" size="sm">Coming Soon</Badge>
          )}
        </div>
        <ToolIcon name={tool.icon} />
      </div>
      <p className="text-sm text-surface-500 leading-relaxed">
        {tool.description}
      </p>
    </div>
  );

  if (!isClickable) return card;

  return (
    <a href={toolHref(tool)} className="contents">
      {card}
    </a>
  );
}

export default function App() {
  const [activeCategory, setActiveCategory] = useState<string>("All");

  const filteredTools =
    activeCategory === "All"
      ? tools
      : tools.filter((t) => t.category === activeCategory);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-white border-b border-surface-200">
        <div className="max-w-screen-xl mx-auto px-6 py-8">
          <h1 className="text-3xl font-semibold tracking-tight text-surface-900 font-display">
            Tools Hub
          </h1>
          <p className="text-surface-600 mt-1 text-sm">
            All your AI-powered tools in one place.
          </p>
        </div>
      </div>

      {/* Category filter */}
      <div className="bg-white border-b border-surface-200">
        <div className="max-w-screen-xl mx-auto px-6">
          <div className="flex gap-1 overflow-x-auto py-2">
            {["All", ...categories].map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={[
                  "px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors duration-fast rounded-control",
                  activeCategory === cat
                    ? "bg-black text-white"
                    : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50",
                ].join(" ")}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tool grid */}
      <div className="max-w-screen-xl mx-auto px-6 py-8">
        {filteredTools.length === 0 ? (
          <p className="text-surface-500 text-sm">No tools in this category yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredTools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

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
5. Add environment variable: `OPENAI_API_KEY` (server-side; used by `/api/chat` or tool-specific routes)
6. Deploy

Shared packages are referenced with `file:../../packages/...` (not `workspace:*`) so Vercel’s occasional `npm install` for serverless functions still works — no Corepack env var needed per project.

**Vercel `api/` TypeScript rules:** Vercel typechecks serverless files with NodeNext (not the Vite `bundler` tsconfig). Handlers must import `VercelRequest` / `VercelResponse` from `@vercel/node` (add it as a devDependency) and may need `/// <reference types="node" />`. Relative ESM imports need an explicit `.js` extension (e.g. `from '../server/foo.js'` even when the source file is `.ts`). Catch blocks should narrow `unknown` with `instanceof Error` before reading `.message`.

Repeat for each tool. Each gets its own URL like `hub.vercel.app`, `tool-auth.vercel.app`, etc.

After deploying, update `apps/hub/src/tools.config.ts` with the real Vercel tool URLs, and set `HUB_PROD_URL` in `packages/ui/src/hub.ts` (or `VITE_HUB_URL` per app) to the live hub URL.

---

## How to Add a New Tool

1. Copy `apps/tool-starter/` to `apps/tool-myname/`
2. In the copy, rename `"name": "tool-starter"` in `package.json` to `"name": "tool-myname"`
3. Assign a free local Vite port in `vite.config.ts` (hub 5173, video-curator 5174, tool-starter 5175 — pick the next free one)
4. Edit `apps/tool-myname/src/App.tsx` to build the tool
5. Add an entry to `apps/hub/src/tools.config.ts` with both `url` (Vercel) and `devUrl` (`http://localhost:<port>`)
6. Create a new Vercel project pointing to `apps/tool-myname`
7. Update the `url` field in `tools.config.ts` with the live Vercel URL

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