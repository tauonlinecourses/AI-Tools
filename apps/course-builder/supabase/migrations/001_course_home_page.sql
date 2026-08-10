-- Course home page ("עמוד ראשי"): a page owned by the course, not by a section.
-- Apply once via the Supabase SQL editor (or CLI) against the live project.

alter table pages
  add column if not exists course_id uuid references courses(id) on delete cascade;

alter table pages
  alter column section_id drop not null;

-- Exactly one owner: either a section (lesson page) or a course (home page).
alter table pages drop constraint if exists pages_section_or_course;
alter table pages
  add constraint pages_section_or_course check (
    (section_id is not null and course_id is null)
    or (section_id is null and course_id is not null)
  );

create unique index if not exists pages_one_home_per_course
  on pages(course_id)
  where section_id is null;

create index if not exists idx_pages_course_id on pages(course_id);
