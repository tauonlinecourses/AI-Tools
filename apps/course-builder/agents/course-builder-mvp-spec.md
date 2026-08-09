# Course Builder — Project Structure

Internal workflow tool for course **builders** and **implementers** — not student-facing at any point. Builders design course structure and page content here; implementers use it as a reference to manually implement the course in Moodle or edX. MVP = authoring + review views only.

## Stack
- Next.js (App Router)
- Supabase (Postgres) — relational schema, no jsonb blob
- shadcn/ui + Tailwind
- dnd-kit (drag-and-drop reordering)

## Data Model

```
courses
  id (uuid, pk)
  title
  description
  created_at, updated_at

sections
  id (uuid, pk)
  course_id (fk -> courses)
  title
  position (int)

pages
  id (uuid, pk)
  section_id (fk -> sections)
  title
  position (int)
  notes (text, nullable — free-text notes about the page, shown in both editor and review view, for implementers)

components
  id (uuid, pk)
  page_id (fk -> pages)
  type (text: 'banner' | 'video' | 'text' | 'question')
  position (int)
  props (jsonb — type-specific fields)
```

Ordering: simple integer `position`, renumber siblings on reorder.

## Component Types (MVP)

| Type | Key props |
|---|---|
| `banner` | title, subtitle, imageUrl |
| `video` | url, provider |
| `text` | markdown |
| `question` | questionType, prompt, options[], correctOptionId, explanation |

## App Structure

```
/app
  /courses                     → list all courses
  /courses/[courseId]/edit     → block editor (sections/pages/components)
  /courses/[courseId]/review   → read-only view for implementers (structure, content, notes, status)
  /api/courses                 → CRUD for courses
  /api/sections, /pages, /components → CRUD, reorder endpoints
/components
  /editor                      → editor-only UI (block palette, drag handles, side panel)
  /blocks                      → shared renderers (banner, video, text, question) — used by both editor (editable) and preview (read-only)
/lib
  supabase.ts                  → client
```

## Implementation Status Tracking

Tracks whether a component's build here is reflected in Moodle yet. Status is **derived from timestamps**, not stored, so it can't drift out of sync with edits.

```sql
alter table components add column implemented_at timestamptz;

-- auto-bump updated_at on any props change
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger components_updated_at
before update on components
for each row execute function set_updated_at();
```

Status logic:
- `implemented_at is null` → **not_implemented**
- `implemented_at < updated_at` → **needs_update** (edited since last implementation)
- `implemented_at >= updated_at` → **implemented**

"Mark as implemented" action: `update components set implemented_at = now() where id = X`.

Rollups (page/section level "3/5 implemented") are computed via views, not cached, to stay consistent with the per-component derivation:

```sql
create view component_status as
select id, page_id,
  case
    when implemented_at is null then 'not_implemented'
    when implemented_at < updated_at then 'needs_update'
    else 'implemented'
  end as status
from components;

create view page_status as
select p.id as page_id,
  count(*) filter (where cs.status = 'implemented') as implemented_count,
  count(*) filter (where cs.status = 'needs_update') as needs_update_count,
  count(*) filter (where cs.status = 'not_implemented') as not_implemented_count,
  count(*) as total_count
from pages p
left join component_status cs on cs.page_id = p.id
group by p.id;

create view section_status as
select s.id as section_id,
  sum(ps.implemented_count) as implemented_count,
  sum(ps.needs_update_count) as needs_update_count,
  sum(ps.not_implemented_count) as not_implemented_count,
  sum(ps.total_count) as total_count
from sections s
left join pages p on p.section_id = s.id
left join page_status ps on ps.page_id = p.id
group by s.id;
```

## Pages / UI

**RTL + Hebrew is a core requirement, not a retrofit** — `dir="rtl"` and `lang="he"` on the root layout from day one. Use Tailwind logical properties (`ms-`/`me-`, `ps-`/`pe-`) instead of `ml-`/`mr-`/`pl-`/`pr-`. Watch for icons that need manual mirroring (chevrons, drag handles) since Lucide doesn't auto-flip. Test dnd-kit reordering specifically under RTL.

### Routes

| Route | Purpose |
|---|---|
| `/` | Home — list of courses (name, section count, page count, last updated) + "create new course" button |
| `/courses/[courseId]` | Redirects to `/courses/[courseId]/edit` |
| `/courses/[courseId]/edit` | Editor view — sidebar nav (course title, sections, pages) + main content (page title, notes, component blocks, add-component button) |
| `/courses/[courseId]/review` | Implementer view — same shell/layout as editor, but read-only mirror: no edit controls, no drag, no add-component button; shows implementation status per component |

### Editor/Review shared layout
- **Sidebar (right side, per RTL)**: course title, collapsible section list, pages nested under each section, numbered (e.g. 1.1.1), current page highlighted. In edit mode: "+ הוסף עמוד" (add page) button under each section's page list, "+ הוסף שיעור" (add section) button under the full section list. Both hidden in review mode.
- **Main content**: page title + numbering, notes field below title, stacked component blocks (drag handle in edit mode only), add-component button at bottom (edit mode only).
- Both views render the same block components with an `editable: boolean` prop — no separate component set to maintain.

## Notes
- No auth yet — single-user MVP.
- Block renderers take `props` + `editable: boolean` so editor and review view share one component per block type.
- No jsonb-blob-per-course; content lives in normalized tables with `components.props` as the only flexible/jsonb field.
