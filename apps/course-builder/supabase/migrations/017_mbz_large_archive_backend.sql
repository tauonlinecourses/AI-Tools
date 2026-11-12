-- Support large MBZ archives: raise Storage limit + record where the bytes live.
-- Files that exceed project/Storage limits are kept in the browser (IndexedDB)
-- with storage_backend = 'idb'.

alter table public.course_mbz_sources
  add column if not exists storage_backend text not null default 'supabase';

-- Tighten allowed values (ignore if constraint already exists).
do $$
begin
  alter table public.course_mbz_sources
    add constraint course_mbz_sources_storage_backend_check
    check (storage_backend in ('supabase', 'idb'));
exception
  when duplicate_object then null;
end $$;

-- Raise bucket limit to 1 GiB when the plan allows it (no-op if bucket missing).
update storage.buckets
set file_size_limit = 1073741824
where id = 'course-mbz';
