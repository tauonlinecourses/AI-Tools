-- MBZ roundtrip data: logged-in users only.
-- Replaces the open anon policies from 016, matching what 007 did for the core
-- course tables. No rows or files change.

begin;

drop policy if exists "anon_authenticated_all" on public.course_mbz_sources;
drop policy if exists "authenticated_all" on public.course_mbz_sources;
create policy "authenticated_all" on public.course_mbz_sources
  for all to authenticated
  using (true) with check (true);

drop policy if exists "anon_authenticated_all" on public.course_mbz_bindings;
drop policy if exists "authenticated_all" on public.course_mbz_bindings;
create policy "authenticated_all" on public.course_mbz_bindings
  for all to authenticated
  using (true) with check (true);

drop policy if exists "course_mbz_anon_authenticated_all" on storage.objects;
drop policy if exists "course_mbz_authenticated_all" on storage.objects;
create policy "course_mbz_authenticated_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'course-mbz')
  with check (bucket_id = 'course-mbz');

commit;
