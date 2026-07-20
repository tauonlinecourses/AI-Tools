<!-- AGENT DOC: Step 3a — packages/ui basics -->
<!-- Topic: package.json, globals.css, Button, Card -->
<!-- Part of: agents/workspace/ — start at README.md -->

> **Agents:** Read [README.md](./README.md) first for the full map. This file is **part 4 of 10**.
>
> ← Previous: [03-packages-config.md](./03-packages-config.md)
> → Next: [05-packages-ui-layout.md](./05-packages-ui-layout.md)

---

## Step 3a — Build `packages/ui` (basics)

Shared component library. Continues in [05-packages-ui-layout.md](./05-packages-ui-layout.md) for layout/exports.

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

