-- Do not store original .mbz bytes in Supabase (quota). Export re-asks for the file.
-- storage_backend = 'reupload' means only metadata is kept; user supplies the archive on export.
-- Safe to run even if 017 was skipped (adds the column when missing).

alter table public.course_mbz_sources
  add column if not exists storage_backend text;

-- Backfill any existing rows before adding NOT NULL / check.
update public.course_mbz_sources
set storage_backend = 'reupload'
where storage_backend is null
   or storage_backend not in ('supabase', 'idb', 'reupload');

alter table public.course_mbz_sources
  alter column storage_backend set default 'reupload';

alter table public.course_mbz_sources
  alter column storage_backend set not null;

alter table public.course_mbz_sources
  drop constraint if exists course_mbz_sources_storage_backend_check;

alter table public.course_mbz_sources
  add constraint course_mbz_sources_storage_backend_check
  check (storage_backend in ('supabase', 'idb', 'reupload'));
