<!-- AGENT DOC: packages/ai-client — platform gateway hooks -->
<!-- Part of: agents/workspace/ — start at README.md -->

> **Agents:** Read [README.md](./README.md) first. This file documents `@workspace/ai-client` after the Next.js platform migration.
>
> ← Previous: [05-packages-ui-layout.md](./05-packages-ui-layout.md)
> → Next: [07-apps-hub-config.md](./07-apps-hub-config.md) *(legacy Vite hub — see platform instead)*

---

## `packages/ai-client`

Thin typed client for the platform AI gateway (`/api/ai`). **No OpenAI SDK, no API key** — only React hooks and fetch helpers.

### Exports

| Export | Use when |
|---|---|
| `useToolChat(toolId)` | Chat UI that streams responses (wraps AI SDK `useChat`) |
| `completeViaGateway({ toolId, prompt })` | One-shot calls that need the full text (e.g. JSON segmentation) |

### `useToolChat(toolId)`

```typescript
import { useToolChat } from "@workspace/ai-client";

const { messages, sendMessage, status } = useToolChat("my-tool-id");
```

Pre-wires `DefaultChatTransport` with `api: "/api/ai"` and `body: { toolId }`.

### `completeViaGateway({ toolId, prompt })`

```typescript
import { completeViaGateway } from "@workspace/ai-client";

const text = await completeViaGateway({
  toolId: "video-curator",
  prompt: "…",
});
```

Consumes the SSE UI message stream and concatenates `text-delta` chunks.

### `package.json` shape

```json
{
  "name": "@workspace/ai-client",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@ai-sdk/react": "^4.0.35",
    "ai": "^7.0.32"
  },
  "peerDependencies": { "react": ">=18" }
}
```

No `openai` dependency. No `./server` or `./vercel` exports.

### Platform wiring

`apps/platform/package.json` must list `"@workspace/ai-client": "workspace:*"`, and `next.config.ts` must include it in `transpilePackages`.

### Rules

- Tool code imports from `@workspace/ai-client` only — never from `@ai-sdk/openai` or `openai`.
- Model, system prompt, and temperature live in each tool's `ai.config.ts`, not in client calls.
- The gateway (`app/api/ai/route.ts`) is the only server file that touches the key.
