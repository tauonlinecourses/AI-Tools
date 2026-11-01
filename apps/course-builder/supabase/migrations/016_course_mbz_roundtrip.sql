-- MBZ preserve-and-patch roundtrip: original archive metadata + CB↔Moodle bindings.
-- Storage bucket `course-mbz` holds the uploaded .mbz bytes (path: {course_id}/source.mbz).

create table if not exists public.course_mbz_sources (
  course_id uuid primary key references public.courses(id) on delete cascade,
  storage_path text not null,
  source_filename text not null,
  source_sha1 text not null,
  archive_kind text not null check (archive_kind in ('tgz', 'zip', 'tar')),
  moodle_version text,
  imported_at timestamptz not null default now()
);

create table if not exists public.course_mbz_bindings (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  entity_kind text not null check (entity_kind in ('section', 'activity')),
  cb_id uuid not null,
  moodle_id text not null,
  modtype text,
  activity_dir text,
  payload_field text,
  editable boolean not null default false,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists course_mbz_bindings_course_id_idx
  on public.course_mbz_bindings (course_id);

create index if not exists course_mbz_bindings_cb_id_idx
  on public.course_mbz_bindings (cb_id);

alter table public.course_mbz_sources enable row level security;
alter table public.course_mbz_bindings enable row level security;

drop policy if exists "anon_authenticated_all" on public.course_mbz_sources;
create policy "anon_authenticated_all" on public.course_mbz_sources
  for all to anon, authenticated
  using (true) with check (true);

drop policy if exists "anon_authenticated_all" on public.course_mbz_bindings;
create policy "anon_authenticated_all" on public.course_mbz_bindings
  for all to anon, authenticated
  using (true) with check (true);

-- Storage bucket for original MBZ archives (open policies match current MVP RLS).
insert into storage.buckets (id, name, public, file_size_limit)
values ('course-mbz', 'course-mbz', false, 524288000)
on conflict (id) do nothing;

drop policy if exists "course_mbz_anon_authenticated_all" on storage.objects;
create policy "course_mbz_anon_authenticated_all" on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'course-mbz')
  with check (bucket_id = 'course-mbz');
