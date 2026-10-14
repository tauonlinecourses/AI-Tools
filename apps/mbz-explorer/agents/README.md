# MBZ Explorer — agent docs

Per-tool instructions for Cursor agents. Keep tool-specific specs, flows, and conventions here.

Monorepo-wide workspace docs live in the repo root: `agents/workspace/`.

## What this tool is

MBZ Explorer — Vite app on port **5177**. Hub id: `mbz-explorer`.

**Hub-hosted tool** — no separate Vercel project. Source lives in `apps/mbz-explorer`; the hub imports it and mounts `/mbz-explorer/*` on the hub deployment. Hub `tools.config.ts` uses `hubPath: "/mbz-explorer"` (in-app navigation, shared Platform session — no handoff). Standalone `pnpm --filter mbz-explorer dev` (port 5177) still works for isolated work.

Inspect Moodle `.mbz` backups in the browser: extract → structure tree → lazy content decode (first 2 sections eager; expand / Analyze full course via `decodeSection`).

## Docs

- **[`mbz explorer spec.md`](./mbz%20explorer%20spec.md)** — single source of truth (stack, manifest, parser, lazy decode, milestones)
- **[`mbz-file.md`](./mbz-file.md)** — Moodle `.mbz` format reference (folder layout, file types, structured vs custom content)

## Key folders

| Path | Role |
|---|---|
| `src/lib/mbz-parser/` | Pure extract/parse/decode (no UI) |
| `src/lib/courseTree.ts` | Top-level sections + nested subsection folders for UI |
| `src/lib/activityTypeIcon.ts` | Sidebar activity-type → logo map |
| `src/lib/idb.ts` / `session.ts` | IndexedDB + orchestration |
| `public/*.svg` | Activity type logos (page, h5p, forum, assign/task, glossary, board) |
| `src/components/explorer/` | Sidebar Tree (Course Builder chrome), HomeStructureTree, ContentViewer, H5P card, overview |
| `src/components/icons.tsx` | Shared icons (chevron, folder, file, home) |
| `src/pages/` | Dashboard + Explorer routes |

## Convention

After changing tool behavior, update `mbz explorer spec.md` so it stays the source of truth.
