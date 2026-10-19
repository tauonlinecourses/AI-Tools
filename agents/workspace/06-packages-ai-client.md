<!-- AGENT DOC: Step 4 — Build packages/ai-client -->
<!-- Topic: Secure OpenAI wrapper — server.ts handler, client.ts useAI/aiChat -->
<!-- Part of: agents/workspace/ — start at README.md -->

> **Agents:** Read [README.md](./README.md) first for the full map. This file is **part 6 of 10**.
>
> ← Previous: [05-packages-ui-layout.md](./05-packages-ui-layout.md)
> → Next: [07-apps-hub-config.md](./07-apps-hub-config.md)

---

## Step 4 — Build `packages/ai-client`

**Security model:** the OpenAI API key is **never** in the browser bundle. All OpenAI
logic lives in `src/server.ts`, which runs only as a Vercel serverless function and reads
`process.env.OPENAI_API_KEY`. React components import from `@workspace/ai-client/client`
(the `useAI` hook), which calls the relative route `/api/chat` — no SDK, no key.

See [secure-ai-client.md](./secure-ai-client.md) for the full refactor guide and rules.

### `packages/ai-client/package.json`

`exports` expose four entry points: the root (`index.ts`), `./client` (browser-safe),
`./server` (the Web `handler`), and `./vercel` (the Node `(req,res)` serverless entry).
`openai` is a runtime dependency; `react` is a peer dependency because `client.ts` ships
the `useAI` hook.

**Build step:** `tsc -p tsconfig.build.json` compiles `src/server.ts` + `src/vercel.ts` →
`dist/*.js` (+ `.d.ts`). Browser `client.ts` stays source-only (Vite) so the CommonJS build
does not need to resolve `@workspace/auth/client` package exports.
The `./vercel` export's `default` points at **`./vercel.cjs`** (a thin wrapper around
`./dist/vercel.js`). Vercel Node cannot import raw `.ts` from `node_modules`, and Node ESM
(`"type": "module"` apps) does not unwrap `exports.default = fn` — a static
`import handler from '@workspace/ai-client/vercel'` would receive `{ default: fn }` and
calling it after auth crashes with `FUNCTION_INVOCATION_FAILED`. `vercel.cjs` sets
`module.exports = fn` so the default import is the function. Its `types` stay on
`./src/vercel.ts` for editor/type-check convenience.
`.`/`./client`/`./server` stay on source because they're only consumed by Vite (which
compiles TS). Under `vite dev`, `packages/dev-api` loads `api/chat.ts` through Vite SSR and
aliases `@workspace/ai-client/vercel` to `src/vercel.ts`, so the dev path never needs `dist`.

> Workspace consumers use the **`workspace:*`** protocol (never `file:`). `file:` makes pnpm
> copy a source-only snapshot into its store at install time, so a later-built `dist` is
> invisible to the app and the serverless function crashes.

```json
{
  "name": "@workspace/ai-client",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "scripts": {
    "build": "tsc -p tsconfig.build.json"
  },
  "exports": {
    ".":        { "types": "./src/index.ts",  "default": "./src/index.ts" },
    "./client": { "types": "./src/client.ts", "default": "./src/client.ts" },
    "./server": { "types": "./src/server.ts", "default": "./src/server.ts" },
    "./vercel": { "types": "./src/vercel.ts", "default": "./vercel.cjs" }
  },
  "peerDependencies": {
    "react": ">=18"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "@vercel/node": "^3.2.0",
    "@workspace/config": "workspace:*",
    "react": "^18.2.0",
    "typescript": "^5.0.0"
  },
  "dependencies": {
    "openai": "^6.48.0"
  }
}
```

### `packages/ai-client/src/server.ts`

The **only** file in the monorepo that imports `openai` or reads the API key. It is a
Web-standard `(request: Request) => Response` handler. Live apps wrap it with Platform Auth
in `api/chat.ts` (`withPlatformAuth(vercelHandler, { toolId })` from `@workspace/auth/server`;
the hub omits `toolId` and only requires approved status), which calls
`@workspace/ai-client/vercel`. Returns `{ content }`.

**Internal cost / abuse guardrails (shared):**

| Rule | Value |
|---|---|
| Allowed models | `gpt-4o`, `gpt-4o-mini` (default `gpt-4o`) |
| `max_tokens` | Always `4096` |
| Max messages | 40 |
| Max chars / message (and systemPrompt) | 16 000 |
| Max total chars | 64 000 → `413` |
| Stdout metric | `{ event: "ai_chat", status, model, messageCount, latencyMs }` — never prompts |

Auth is **not** in this file — each app's `api/chat.ts` must gate before calling the handler.

The optional `temperature` and `responseFormat` (JSON mode) let callers such as
video-curator's transcript segmentation get deterministic, valid-JSON output while all
OpenAI logic stays here. On failure the handler returns a structured `{ error, details }`
body so callers can surface meaningful messages. See source at
`packages/ai-client/src/server.ts`.

### `packages/ai-client/src/client.ts`

Browser-safe. No OpenAI SDK, no API key. `useAI()` is the hook components should use;
`aiChat()` is the low-level call. `callAI`/`prompt` are preserved for backwards
compatibility and now also route through the secure `/api/chat` endpoint.

```typescript
import { useState, useCallback } from "react";

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

export type AskOptions = {
  messages: Message[];
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  responseFormat?: { type: 'text' | 'json_object' };
};

// Attaches Platform JWT via `@workspace/auth/client` (normal dynamic import so
// Vite rewrites the specifier — `new Function(import)` bypasses Vite and
// causes `/api/chat` 401 Missing Authorization).
export async function aiChat(options: AskOptions): Promise<string> {
  const authHeaders = await platformAuthHeaders();
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify(options),
  });

  if (!res.ok) {
    const error = await res.text().catch(() => res.statusText);
    throw new Error(`AI request failed (${res.status}): ${error}`);
  }

  const data = await res.json();
  return data.content as string;
}

// React hook — use this in all tool components.
export function useAI() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback(async (options: AskOptions): Promise<string | null> => {
    setLoading(true);
    setError(null);
    try {
      return await aiChat(options);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { ask, loading, error };
}

// Legacy wrapper, preserved so existing @workspace/ai-client (index.ts) imports
// keep working. Routes through the secure /api/chat endpoint.
export async function callAI(
  messages: Message[],
  options: CallOptions = {}
): Promise<AIResult> {
  const { model, systemPrompt } = options;

  try {
    const text = await aiChat({ messages, model, systemPrompt });
    return { text, error: null };
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

Unchanged — re-exports the legacy `callAI`/`prompt` API. New code should prefer
`@workspace/ai-client/client` (`useAI`).

```typescript
export { callAI, prompt } from "./client";
export type { Message, CallOptions, AIResult, AIResponse, AIError } from "./client";
```

### Consuming apps

Any app whose `api/chat.ts` re-exports `@workspace/ai-client/vercel` (and any component
importing `@workspace/ai-client/client`) must declare the dependency:

```json
"@workspace/ai-client": "file:../../packages/ai-client"
```
