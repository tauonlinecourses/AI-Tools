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

`exports` expose three entry points: the root (`index.ts`), `./client` (browser-safe),
and `./server` (serverless only). `openai` is a runtime dependency; `react` is a peer
dependency because `client.ts` ships the `useAI` hook.

```json
{
  "name": "@workspace/ai-client",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
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
  },
  "peerDependencies": {
    "react": ">=18"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@workspace/config": "file:../config",
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
Web-standard `(request: Request) => Response` handler, re-exported as the default export
by each app's `api/chat.ts`. Returns `{ content }`.

```typescript
import OpenAI from 'openai';

export type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type ChatRequest = {
  messages: Message[];
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  responseFormat?: { type: 'text' | 'json_object' };
};

export async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const { messages, model = 'gpt-4o', systemPrompt, temperature, responseFormat } = body;

  if (!messages || !Array.isArray(messages)) {
    return new Response('messages must be an array', { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { error: 'Missing OPENAI_API_KEY on server.' },
      { status: 500 }
    );
  }

  const fullMessages: Message[] = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, // server env only — never VITE_*
  });

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: fullMessages,
      ...(temperature !== undefined ? { temperature } : {}),
      ...(responseFormat ? { response_format: responseFormat } : {}),
    });

    const content = completion.choices[0]?.message?.content ?? '';

    return Response.json({ content });
  } catch (err) {
    const status =
      typeof (err as { status?: unknown })?.status === 'number'
        ? (err as { status: number }).status
        : 500;
    const details = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `OpenAI API error: ${status}`, details },
      { status }
    );
  }
}
```

The optional `temperature` and `responseFormat` (JSON mode) let callers such as
video-curator's transcript segmentation get deterministic, valid-JSON output while all
OpenAI logic stays here. On failure the handler returns a structured `{ error, details }`
body so callers can surface meaningful messages.

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

// Low-level fetch call to /api/chat. Use useAI() in components instead.
export async function aiChat(options: AskOptions): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

Any app whose `api/chat.ts` re-exports `@workspace/ai-client/server` (and any component
importing `@workspace/ai-client/client`) must declare the dependency:

```json
"@workspace/ai-client": "file:../../packages/ai-client"
```
