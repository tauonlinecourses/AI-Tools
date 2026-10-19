# Dictionary Tool — agent docs

Per-tool instructions for Cursor agents. Keep tool-specific specs, flows, and conventions here.

Monorepo-wide workspace docs live in the repo root: `agents/workspace/`.

## What this tool is

Dictionary Tool — Vite app on port **5179**. Hub id: `dictionary-tool`.

**Hub-hosted tool** — no separate Vercel project. Source lives in `apps/dictionary-tool`; the hub imports it and mounts `/dictionary-tool/*` on the hub deployment. Hub `tools.config.ts` uses `hubPath: "/dictionary-tool"` (in-app navigation, shared Platform session — no handoff). Standalone `pnpm --filter dictionary-tool dev` (port 5179) still works for isolated work.

Converts an Excel glossary (**מושג**, **הגדרה**; optional **יחידה** ignored) into Moodle glossary import XML, fully client-side.

## Docs

- **[`dictionary-tool-spec.md`](./dictionary-tool-spec.md)** — source of truth (Excel contract, XML shape, UI flow)
- **[`fixtures/moodle-glossary-sample.xml`](./fixtures/moodle-glossary-sample.xml)** — Moodle glossary export used as the XML template
- **[`fixtures/glossary-units-sample.xlsx`](./fixtures/glossary-units-sample.xlsx)** — real Excel sample (`מושג` / `הגדרה` / `יחידה`)

## Key folders

| Path | Role |
|---|---|
| `src/lib/parseExcel.ts` | SheetJS parse + column detection |
| `src/lib/buildGlossaryXml.ts` | Moodle `GLOSSARY` XML builder + download |
| `src/pages/HomePage.tsx` | Upload → preview → download |
| `src/components/UploadDropzone.tsx` | Excel dropzone |

## Convention

After changing tool behavior, update `dictionary-tool-spec.md` so it stays the source of truth.
