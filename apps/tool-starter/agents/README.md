# Tool agent docs

Per-tool instructions for Cursor agents. Keep tool-specific specs, flows, and conventions here.

Monorepo-wide workspace docs live in the repo root: `agents/workspace/`.

## Convention

Every tool app must include an `apps/<tool>/agents/` folder (copied from `apps/tool-starter/agents/` when scaffolding).

Suggested files:
- `README.md` — this map (what the tool does, which docs to read)
- Feature/spec docs as needed (e.g. `mvp-spec.md`, `phase-flows.md`)

After changing tool behavior, update the matching doc in this folder so it stays the source of truth for this app.
