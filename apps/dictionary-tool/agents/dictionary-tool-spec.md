# Dictionary Tool — Project Spec

**Audience:** Cursor agents implementing or changing Dictionary Tool.

## Purpose

Upload an Excel list of concepts → download Moodle glossary XML for import.

## Boundary

- Hub-hosted at `/dictionary-tool` (`hubPath` in `tools.config.ts`)
- No server upload APIs; all work in the browser
- Standalone Vite port **5179**

## Excel contract

First sheet — **2 or 3 columns** (sample: [`fixtures/glossary-units-sample.xlsx`](./fixtures/glossary-units-sample.xlsx)):

| מושג | הגדרה | יחידה (optional) |
|------|-------|------------------|
| מושג לדוגמה | הגדרה לדוגמה | 4.1 |

- Required for XML: `מושג` + `הגדרה` (aliases: `שם המושג` / `הסבר`, English `concept` / `definition`)
- Optional `יחידה` is detected and **ignored** — never written to Moodle XML
- If headers missing → columns A/B (2-column fallback; extra columns ignored)
- Skip rows with empty concept; allow empty definition (warn in UI)
- Cells are trimmed (sample file has trailing spaces on some מושג values)

## XML contract

Matches Moodle glossary export (`fixtures/moodle-glossary-sample.xml`):

- Root `GLOSSARY` → `INFO` → `ENTRIES` → `ENTRY`
- Fixed INFO defaults: `DISPLAYFORMAT=dictionary`, `ENTBYPAGE=10`, etc.
- Each `DEFINITION` is XML-escaped HTML: `<p dir="rtl">…</p>`
- No `<ALIASES>` in v1

## UI flow

1. Dropzone for `.xlsx` / `.xls` — click **or** drag-and-drop (`onDrop` / `preventDefault` on drag over)
2. Preview table + editable glossary name / intro
3. Download `.xml`

## Hub wiring

Same checklist as MBZ Explorer: Host component, route, Vite/Tailwind/tsconfig include, `PLATFORM_TOOL_IDS`, DB check constraint, i18n, Admin labels.
