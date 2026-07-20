<!-- AGENT DOC: Step 3b — packages/ui layout & exports -->
<!-- Topic: Input, Badge, Spinner, hub.ts, PageLayout, index exports -->
<!-- Part of: agents/workspace/ — start at README.md -->

> **Agents:** Read [README.md](./README.md) first for the full map. This file is **part 5 of 10**.
>
> ← Previous: [04-packages-ui-basics.md](./04-packages-ui-basics.md)
> → Next: [06-packages-ai-client.md](./06-packages-ai-client.md)

---

## Step 3b — `packages/ui` form controls, layout & exports

Continues Step 3 from [04-packages-ui-basics.md](./04-packages-ui-basics.md). Covers Input, Badge, Spinner, hub URL helpers, PageLayout, and package exports.

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
 * Live hub on Vercel: https://ai-tools-tauonline.vercel.app/
 * Override per app with `VITE_HUB_URL` if needed.
 */
export const HUB_PROD_URL = "https://ai-tools-tauonline.vercel.app";

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
import logoSrc from "../assets/Logo.png";

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
        <img
          src={logoSrc}
          alt=""
          aria-hidden
          className="ml-auto h-8 w-auto shrink-0"
        />
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

The nav bar shows the brand logo on the right. The asset lives at `packages/ui/src/assets/Logo.png` and is imported by `PageLayout`, so every tool bundles it (no dependency on the Hub being reachable). The Hub header uses `apps/hub/public/logo-narrow.png`.


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

