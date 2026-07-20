# Secure AI Client — Agent Implementation Guide

## Goal

Refactor the monorepo so that the OpenAI API key is **never exposed in the browser bundle**.
Every tool app exposes a single serverless route (`/api/chat`). React components call that
route via a shared fetch wrapper — they never import the OpenAI SDK or touch an API key.
All OpenAI logic lives in one shared file (`packages/ai-client/src/server.ts`).

After this implementation, adding a new tool requires exactly **one new file** to get AI
working: `apps/<tool>/api/chat.ts`.

---

## Non-goals

- Do not implement streaming in this pass. Streaming can be added later by extending `server.ts`.
- Do not change the hub's `tools.config.ts` or any Vercel deployment settings unless instructed below.
- Do not rename or restructure existing tool apps.

---

## End-state file structure

```
AI-Tools/
├── packages/
│   └── ai-client/
│       ├── package.json          ← UPDATED: add exports for ./client and ./server
│       └── src/
│           ├── index.ts          ← UNCHANGED (preserve any existing exports)
│           ├── client.ts         ← NEW: browser-safe fetch wrapper + useAI hook
│           └── server.ts         ← NEW: OpenAI handler, reads env via globalThis.process
│
├── apps/
│   ├── hub/
│   │   └── api/
│   │       └── chat.ts           ← NEW: 1-line re-export
│   ├── video-curator/
│   │   └── api/
│   │       └── chat.ts           ← NEW: 1-line re-export
│   └── tool-starter/
│       └── api/
│           └── chat.ts           ← NEW: 1-line re-export (included in template)
│
├── .env.example                  ← UPDATED: replace VITE_OPENAI_API_KEY with OPENAI_API_KEY
└── agents/
    └── secure-ai-client.md       ← this file
```

---

## Step 1 — Install the OpenAI SDK in `packages/ai-client`

Run from the monorepo root:

```bash
pnpm add openai --filter @repo/ai-client
```

---

## Step 2 — Update `packages/ai-client/package.json`

Add `exports` to the existing `package.json`. Preserve any fields already present.
Merge in the following `exports` block:

```json
{
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    },
    "./client": {
      "types": "./src/client.ts",
      "default": "./src/client.ts"
    },
    "./server": {
      "types": "./src/server.ts",
      "default": "./src/server.ts"
    }
  }
}
```

---

## Step 3 — Create `packages/ai-client/src/server.ts`

This file is the only place in the entire monorepo that imports OpenAI or reads the API key.
It runs exclusively as a Vercel serverless function — never in the browser.

> **Env access:** Because each app exports the raw `.ts` source (`./server`), the consuming
> app / Vercel Edge Function compiles `server.ts` under its own tsconfig, which does not have
> `@types/node` in scope. Referencing the ambient `process` global there fails with
> `TS2591: Cannot find name 'process'`. To stay self-contained, read env through
> `globalThis.process` instead of the ambient `process` global — this needs no Node type
> definitions in the consumer and works across Node and Edge runtimes.

```ts
import OpenAI from 'openai';

export type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type ChatRequest = {
  messages: Message[];
  model?: string;
  systemPrompt?: string;
};

// Read server env without depending on @types/node being resolvable in the
// consuming app's build (avoids TS2591 "Cannot find name 'process'").
const serverEnv: Record<string, string | undefined> =
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {};

export async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body: ChatRequest;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const { messages, model = 'gpt-4o', systemPrompt } = body;

  if (!messages || !Array.isArray(messages)) {
    return new Response('messages must be an array', { status: 400 });
  }

  const fullMessages: Message[] = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  const client = new OpenAI({
    apiKey: serverEnv.OPENAI_API_KEY, // server env only — never VITE_*
  });

  const completion = await client.chat.completions.create({
    model,
    messages: fullMessages,
  });

  const content = completion.choices[0]?.message?.content ?? '';

  return Response.json({ content });
}
```

---

## Step 4 — Create `packages/ai-client/src/client.ts`

This file is imported by React components. It has no OpenAI dependency and no API key.
It calls `/api/chat` as a relative URL, which Vercel routes to the serverless function.

```ts
import { useState, useCallback } from 'react';

export type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type AskOptions = {
  messages: Message[];
  model?: string;
  systemPrompt?: string;
};

/**
 * Low-level fetch call to /api/chat. Use useAI() in components instead.
 */
export async function aiChat(options: AskOptions): Promise<string> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });

  if (!res.ok) {
    const error = await res.text().catch(() => res.statusText);
    throw new Error(`AI request failed (${res.status}): ${error}`);
  }

  const data = await res.json();
  return data.content as string;
}

/**
 * React hook. Use this in all tool components.
 *
 * const { ask, loading, error } = useAI();
 * const result = await ask({ messages: [{ role: 'user', content: prompt }] });
 */
export function useAI() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback(async (options: AskOptions): Promise<string | null> => {
    setLoading(true);
    setError(null);
    try {
      return await aiChat(options);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { ask, loading, error };
}
```

---

## Step 5 — Create `api/chat.ts` inside each tool app

For **every app** in `apps/` (hub, video-curator, tool-starter, and any others):

Create the file `apps/<app-name>/api/chat.ts` with exactly this content:

```ts
export { handler as default } from '@repo/ai-client/server';
```

That is the entire file. Vercel picks up any file in `api/` as a serverless function and
calls it as the default export. The handler from `server.ts` is already a valid Vercel handler.

---

## Step 6 — Update React components to use `useAI()`

For any component that currently calls OpenAI directly or reads `VITE_OPENAI_API_KEY`,
replace the pattern with:

```tsx
import { useAI } from '@repo/ai-client/client';

export function MyComponent() {
  const { ask, loading, error } = useAI();

  async function handleSubmit(userInput: string) {
    const result = await ask({
      messages: [{ role: 'user', content: userInput }],
      systemPrompt: 'You are a helpful assistant.', // optional
    });
    if (result) {
      // use result
    }
  }

  return (
    <>
      {loading && <p>Thinking…</p>}
      {error && <p>Error: {error}</p>}
      {/* rest of UI */}
    </>
  );
}
```

---

## Step 7 — Clean up environment variables

### In every `apps/<tool>/.env.local` (local dev files, not committed)

Remove any line containing `VITE_OPENAI_API_KEY`.
Add if not already present:

```
OPENAI_API_KEY=sk-your-key-here
```

### Update `.env.example` in the monorepo root

Replace the existing contents with:

```
# Used by Vercel serverless functions (api/chat.ts) and local vercel dev.
# This key must NEVER be prefixed with VITE_ — that would expose it in the browser bundle.
OPENAI_API_KEY=your_openai_key_here

# Production (Vercel): use one team Shared OPENAI_API_KEY.
# Team Settings → Environment Variables → link shared var to each app project.
# See README.md for the full linking procedure.
```

### In Vercel

Confirm the team shared env var is named exactly `OPENAI_API_KEY` (not `VITE_OPENAI_API_KEY`).
If a project-level `VITE_OPENAI_API_KEY` exists in any Vercel project, delete it.

---

## Step 8 — Local development

The Vite dev server does not run serverless functions. Use Vercel CLI for full local testing:

```bash
# From the monorepo root, install Vercel CLI if not present
pnpm add -g vercel

# Run a specific tool locally (example: video-curator)
cd apps/video-curator
vercel dev
```

`vercel dev` runs both the Vite frontend and `api/chat.ts` together, reading `OPENAI_API_KEY`
from your local `.env.local`.

For fast UI iteration without AI calls, mock the response in the component during dev:

```ts
const result = import.meta.env.DEV
  ? 'Mock AI response for local dev'
  : await ask({ messages });
```

---

## Step 9 — Verification checklist

Run these checks before considering the implementation complete.

**Build check — no OpenAI in browser bundle:**
```bash
pnpm build --filter=video-curator
grep -r "OPENAI_API_KEY" apps/video-curator/dist || echo "PASS: key not in bundle"
grep -r "openai" apps/video-curator/dist/assets/*.js | grep -v "openai.com" || echo "PASS: SDK not in bundle"
```

**Type check:**
```bash
pnpm type-check
```

**Runtime check (requires `vercel dev`):**
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"say hello"}]}' \
  | jq .content
# Expected: a short greeting string
```

**Import guard — server.ts must never be imported in client code:**
Search the entire codebase. If this returns any result in a React component or
`client.ts`, the architecture is broken:
```bash
grep -r "ai-client/server" apps/*/src
```
Expected: no output.

---

## Rules — do not violate these

- **Never** prefix `OPENAI_API_KEY` with `VITE_` anywhere in the codebase or Vercel.
- **Never** import `openai` (the SDK) in any file under `apps/*/src/` or in `packages/ai-client/src/client.ts`.
- **Never** call `aiChat()` or `useAI()` from `server.ts` — those are client-only.
- **Never** put business logic (prompt construction, model choice) inside `api/chat.ts` — it is a pass-through only. All logic goes in `server.ts` or in the calling component.
- When creating a new tool by copying `tool-starter`, the `api/chat.ts` file must be copied as-is. No changes needed.

---

## Extension points (out of scope for this guide)

- **Streaming:** Replace `Response.json({ content })` in `server.ts` with a `ReadableStream` response and update `client.ts` to consume the stream.
- **Auth:** Add a shared-secret header check in `server.ts` to restrict who can call `/api/chat`.
- **Per-tool system prompts:** Pass `systemPrompt` from each tool's component via the `ask()` options rather than hardcoding in `server.ts`.
- **Model switching:** Expose `model` as an option (already supported by `server.ts` via the `model` field in `ChatRequest`).
