-- Course Builder MVP schema
-- NOTE: This script has ALREADY BEEN APPLIED to the live Supabase project.
-- It is committed here as the source of truth for future environments.
-- Do not re-run against the existing database.

-- Extension needed for gen_random_uuid()
create extension if not exists pgcrypto;

-- ============================================================
-- TABLES
-- ============================================================

create table courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table sections (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  title text not null,
  position int not null,
  -- Lesson overview fields (nullable until set in edit mode)
  opens_at date,                    -- תאריך פתיחה
  assignments_due_at date,          -- תאריך אחרון להגשת מטלות/תרגילים
  files_folder_url text,            -- לינק לתיקיית קבצים של השיעור
  created_at timestamptz default now()
);

create table pages (
  id uuid primary key default gen_random_uuid(),
  -- Lesson page: section_id set, course_id null.
  -- Course home page ("עמוד ראשי"): course_id set, section_id null.
  section_id uuid references sections(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  title text not null,
  position int not null,
  notes text,
  workflow_status text not null default 'in_progress'
    check (workflow_status in ('in_progress', 'ready_for_implementation')),
  created_at timestamptz default now(),
  constraint pages_section_or_course check (
    (section_id is not null and course_id is null)
    or (section_id is null and course_id is not null)
  )
);

create table components (
  id uuid primary key default gen_random_uuid(),
  page_id uuid references pages(id) on delete cascade,
  type text not null,                    -- 'banner' | 'video' | 'text' | 'question'
  position int not null,
  props jsonb not null default '{}',
  implemented_at timestamptz,             -- null until implementer marks it done
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Per-block Word-style comments (one chronological thread per component).
-- author_role mirrors CourseViewMode. Does not bump components.updated_at.
create table component_comments (
  id uuid primary key default gen_random_uuid(),
  component_id uuid not null references components(id) on delete cascade,
  author_role text not null check (author_role in ('edit', 'implement', 'review')),
  body text not null,
  resolved_at timestamptz,                -- null = open
  created_at timestamptz default now()
);

-- ============================================================
-- INDEXES (foreign keys aren't auto-indexed in Postgres)
-- ============================================================

create index idx_sections_course_id on sections(course_id);
create index idx_pages_section_id on pages(section_id);
create index idx_pages_course_id on pages(course_id);
create unique index pages_one_home_per_course on pages(course_id) where section_id is null;
create index idx_components_page_id on components(page_id);
create index idx_component_comments_component_id on component_comments(component_id);

-- ============================================================
-- AUTO-UPDATE updated_at
-- ============================================================

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger courses_updated_at
before update on courses
for each row execute function set_updated_at();

create trigger components_updated_at
before update on components
for each row execute function set_updated_at();

-- Mark implemented using DB now() so it matches the updated_at trigger
-- (client ISO timestamps can lag and land as needs_update).
create or replace function mark_component_implemented(component_id uuid)
returns components
language plpgsql
as $$
declare
  row components;
begin
  update components
  set implemented_at = now()
  where id = component_id
  returning * into row;
  if row.id is null then
    raise exception 'component not found: %', component_id;
  end if;
  return row;
end;
$$;

-- ============================================================
-- IMPLEMENTATION STATUS VIEWS
-- ============================================================

create view component_status as
select
  id,
  page_id,
  case
    when implemented_at is null then 'not_implemented'
    when implemented_at < updated_at then 'needs_update'
    else 'implemented'
  end as status
from components;

create view page_status as
select
  p.id as page_id,
  count(*) filter (where cs.status = 'implemented') as implemented_count,
  count(*) filter (where cs.status = 'needs_update') as needs_update_count,
  count(*) filter (where cs.status = 'not_implemented') as not_implemented_count,
  count(cs.id) as total_count
from pages p
left join component_status cs on cs.page_id = p.id
group by p.id;

create view section_status as
select
  s.id as section_id,
  coalesce(sum(ps.implemented_count), 0) as implemented_count,
  coalesce(sum(ps.needs_update_count), 0) as needs_update_count,
  coalesce(sum(ps.not_implemented_count), 0) as not_implemented_count,
  coalesce(sum(ps.total_count), 0) as total_count
from sections s
left join pages p on p.section_id = s.id
left join page_status ps on ps.page_id = p.id
group by s.id;

-- No RLS in this MVP (internal tool, no auth). Before sharing a public URL,
-- protect the deployment (Vercel protection / password gate) or add RLS.
