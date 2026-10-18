# AI API Flow — Architecture & Roadmap

How AI calls travel from a React component to OpenAI and back, why the OpenAI
API key never reaches the browser, and what still needs to be done to make the
flow production-grade.

> Related docs: [secure-ai-client.md](./secure-ai-client.md) (implementation guide + the
> five hard constraints) and [06-packages-ai-client.md](./06-packages-ai-client.md)
> (`@workspace/ai-client` package internals).

---

## 1. Goal

The OpenAI API key must **never** appear in the browser bundle. Every tool app exposes a
single serverless route (`/api/chat`). React components call that route through a shared
fetch wrapper — they never import the OpenAI SDK or touch a key. All OpenAI logic lives in
one shared file so there is exactly one place to audit and harden.

---

## 2. Request flow

```mermaid
flowchart LR
  subgraph Browser
    C1[React Component]
    Client["@workspace/ai-client/client<br/>useAI() / aiChat()"]
  end

  subgraph Vercel["Vercel Serverless Function (Node.js runtime)"]
    Route["apps/*/api/chat.ts<br/>re-exports @workspace/ai-client/vercel"]
    Adapter["vercel.ts<br/>req/res ↔ Request/Response"]
    Server["server.ts<br/>handler() — the only file with the SDK + key"]
  end

  subgraph OpenAI
    API["OpenAI API"]
  end

  C1 -->|"ask(...)"| Client
  Client -->|"POST /api/chat (JSON)"| Route
  Route --> Adapter
  Adapter -->|"Web Request"| Server
  Server -->|"OPENAI_API_KEY (server env only)"| API
  API -->|"{ content }"| Server
  Server --> Adapter
  Adapter -->|"JSON"| Client
  Client -->|"string"| C1
```

**Step by step:**

1. A component calls `ask({ messages, systemPrompt?, model?, temperature?, responseFormat? })`
   from the `useAI()` hook (or the lower-level `aiChat()`), imported from
   `@workspace/ai-client/client`.
2. That wrapper does a `fetch("/api/chat", { method: "POST", ... })` — a relative URL, no key.
3. Vercel routes `/api/chat` to `apps/<app>/api/chat.ts`, which re-exports the default handler
   from `@workspace/ai-client/vercel`.
4. `vercel.ts` adapts Vercel's Node `(req, res)` into a Web `Request`, calls the shared
   `handler()` in `server.ts`, and writes the `Response` back to `res`.
5. `server.ts` reads `OPENAI_API_KEY` from server env, calls the OpenAI SDK, and returns
   `{ content }` (or a structured error).
6. The wrapper resolves to a plain string for the component.

---

## 3. Key files

| File | Role | Runs where |
| --- | --- | --- |
| `packages/ai-client/src/client.ts` | `useAI()` hook + `aiChat()` fetch wrapper. No SDK, no key. | Browser |
| `packages/ai-client/src/server.ts` | `handler(request: Request)` — the **only** file that imports the OpenAI SDK and reads `OPENAI_API_KEY`. | Server |
| `packages/ai-client/src/vercel.ts` | Adapts Vercel Node `(req, res)` ↔ Web `Request`/`Response`; default export used as the function entry. | Server |
| `packages/ai-client/vercel.cjs` | Package `./vercel` entry — `module.exports = fn` so Node ESM default-import works in `"type": "module"` apps. | Server |
| `apps/*/api/chat.ts` | Platform Auth gate, then `@workspace/ai-client/vercel`. | Server |
| `packages/ai-client/tsconfig.build.json` | Compiles `src/*` → `dist/*.js` so the Node runtime can import compiled JS (not raw `.ts`). | Build |

---

## 4. Why it is secure today

- **The key never reaches the browser.** It is read only server-side (`server.ts` via
  `globalThis.process`), and is never prefixed with `VITE_`, so bundlers cannot inline it.
- **Single choke point.** All AI traffic flows through one shared `handler()` — one place to
  audit, patch, or add controls.
- **Auth on every live `/api/chat`.** App wrappers call `requireToolAccessFromRequest` (or hub
  `assertUserIsApproved`) before the shared handler — Platform Bearer JWT + approved + tool
  entitlement. See [security.md](./security.md).
- **Cost / input guardrails in `server.ts`.** Model allowlist (`gpt-4o`, `gpt-4o-mini`), hard
  `max_tokens` (4096), message count/size caps (`413` when oversized), stdout metrics
  (`status`, `model`, `messageCount`, `latencyMs` — never prompt text).
- **Clean separation of concerns.** Browser code imports only `.../client`; the SDK and key
  live exclusively in the serverless function.
- **Structured errors.** Failures return JSON (`{ error, details? }`) with sensible status
  codes instead of leaking stack traces; the missing-key case is handled gracefully.

---

## 5. Roadmap — what to do before public / untrusted production

The flow is production-ready for **internal staff behind Platform Auth**. For a
**public or less-trusted deployment**, address the items below (roughly in priority order).

### 5.1 Rate limiting / abuse protection
- **Problem:** an approved user (or stolen JWT) can still hammer the endpoint.
- **Do:** add per-IP / per-user rate limiting (e.g. Vercel KV / Upstash Redis token bucket).

### 5.2 Per-user / day budgets
- **Problem:** `max_tokens` caps a single response, not cumulative spend.
- **Do:** track spend per user/day with a hard cutoff.

### 5.3 Richer observability
- **Problem:** stdout metrics are enough for Vercel logs, not dashboards or alerts.
- **Do:** ship metrics to a sink (latency, error rate, tokens) without logging prompts.

### 5.4 Nice-to-haves
- **Streaming responses** — replace `Response.json({ content })` with a `ReadableStream` and
  update `client.ts` to consume it, for faster perceived latency.
- **Retries & timeouts** — bounded retry on transient 429/5xx from OpenAI with a request timeout.

After deploy, run [prod-smoke-checklist.md](./prod-smoke-checklist.md).

---

## 6. Status checklist

| Concern | Status |
| --- | --- |
| API key hidden from browser | Done |
| Single shared handler | Done |
| Structured error handling | Done |
| Authentication on `/api/chat` | Done (per-app wrappers + Platform Auth) |
| Cost guardrails (`max_tokens`, model allowlist) | Done (shared `server.ts`) |
| Input size/validation limits | Done |
| Observability (stdout metrics) | Done (internal bar) |
| Rate limiting | **TODO** (deferred — public / abuse hardening) |
| Per-user budgets | **TODO** |
| Streaming | Optional / future |
