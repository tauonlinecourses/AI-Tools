-- Lock Tau-Support Data API: deny anon. App servers use service_role after
-- verifying Course-Builder (Platform) JWT + group tool access.

drop policy if exists "anon_authenticated_all" on public.courses;
drop policy if exists "anon_authenticated_all" on public.threads;
drop policy if exists "anon_authenticated_all" on public.messages;
drop policy if exists "anon_authenticated_all" on public.qa_pairs;
drop policy if exists "anon_authenticated_all" on public.info_docs;
drop policy if exists "anon_authenticated_all" on public.kb_chunks;
drop policy if exists "anon_authenticated_all" on public.last_check_all;

-- No authenticated policies on Tau project Auth (users live in Course-Builder).
-- service_role bypasses RLS for the BFF.

drop policy if exists "info_doc_images_anon_insert" on storage.objects;
drop policy if exists "info_doc_images_anon_update" on storage.objects;
drop policy if exists "info_doc_images_anon_delete" on storage.objects;

-- Keep public read for rendered images in info docs (URLs in HTML).
-- Writes go through service_role BFF only.

revoke execute on function public.match_kb_chunks(extensions.vector, int, text, float, text[])
  from anon, authenticated;
grant execute on function public.match_kb_chunks(extensions.vector, int, text, float, text[])
  to service_role;

-- Revoke dangerous SECURITY DEFINER helper if present.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
  end if;
end $$;

-- Disallow SVG uploads on the bucket (XSS vector).
update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/gif', 'image/webp']
where id = 'info-doc-images';
