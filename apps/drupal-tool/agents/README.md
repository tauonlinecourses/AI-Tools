# Drupal Helper — agent docs

Per-tool instructions for Cursor agents. Keep tool-specific specs, flows, and conventions here.

Monorepo-wide workspace docs live in the repo root: `agents/workspace/`.

## What this tool is

Drupal Helper (`כלי עזר לדרופל`) — Vite app on port **5181**. Hub id: `drupal-tool`.

**Hub-hosted tool** — no separate Vercel project. Source lives in `apps/drupal-tool`; the hub imports it and mounts `/drupal-tool/*` on the hub deployment. Hub `tools.config.ts` uses `hubPath: "/drupal-tool"` (in-app navigation, shared Platform session — no handoff). Standalone `pnpm --filter drupal-tool dev` (port 5181) still works for isolated work.

Features: a **component bank** (copy-paste Drupal HTML with live preview) and a planned image generator matched to Drupal site designs.

## Docs

- **[`mvp-spec.md`](./mvp-spec.md)** — product scope and current UI state
- Snippets live in `src/data/componentBank.ts` — add new entries there to grow the bank.

## Convention

After changing tool behavior, update `mvp-spec.md` (or a dedicated feature doc) so it stays the source of truth.

**Copy:** Never use em dashes (`—`) or en dashes (`–`) in user-facing UI text (titles, descriptions, labels, hints). Prefer a period, comma, or colon.
