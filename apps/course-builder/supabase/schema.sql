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
  created_at timestamptz default now()
);

create table pages (
  id uuid primary key default gen_random_uuid(),
  section_id uuid references sections(id) on delete cascade,
  title text not null,
  position int not null,
  notes text,
  created_at timestamptz default now()
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

-- ============================================================
-- INDEXES (foreign keys aren't auto-indexed in Postgres)
-- ============================================================

create index idx_sections_course_id on sections(course_id);
create index idx_pages_section_id on pages(section_id);
create index idx_components_page_id on components(page_id);

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
  sum(ps.implemented_count) as implemented_count,
  sum(ps.needs_update_count) as needs_update_count,
  sum(ps.not_implemented_count) as not_implemented_count,
  sum(ps.total_count) as total_count
from sections s
left join pages p on p.section_id = s.id
left join page_status ps on ps.page_id = p.id
group by s.id;

-- No RLS in this MVP (internal tool, no auth). Before sharing a public URL,
-- protect the deployment (Vercel protection / password gate) or add RLS.
