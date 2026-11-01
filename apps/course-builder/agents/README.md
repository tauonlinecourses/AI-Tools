# Course Builder — Agent docs

Per-tool instructions for Cursor agents. Monorepo-wide docs: `agents/workspace/` (repo root).

| File | When to read |
|---|---|
| [course-builder-mvp-spec.md](./course-builder-mvp-spec.md) | Spec + as-built implementation notes: data model, routes, file map, status tracking, RTL rules, local backup export/import, MBZ roundtrip |
| [mbz-roundtrip.md](./mbz-roundtrip.md) | Moodle `.mbz` import → edit → preserve-and-patch export |
| [todo.md](./todo.md) | Post-MVP checklist — security, blocks, data, UX polish; mark items done as you go |
| [../supabase/schema.sql](../supabase/schema.sql) | DB schema (already applied to the live Supabase project — do not re-run; new MBZ tables need `016_…`) |

Key facts: Vite SPA (port 5176), `react-router-dom`, `@supabase/supabase-js` direct from the client (no auth; RLS on with open `anon` policies until users are added), dnd-kit reordering, RTL Hebrew content inside the shared `PageLayout`. Course overview at `?view=overview` (`CourseOverview` + `recharts`). Local backup: `.coursebuilder.json` via `src/lib/courseBackup.ts` (שמור גיבוי / ייבא גיבוי). MBZ: import `.mbz` + **הורד MBZ** via `@workspace/mbz-parser`. Env: `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in `.env`.

After changing Course Builder behavior, update the matching doc here.
