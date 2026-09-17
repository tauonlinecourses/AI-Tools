-- TAU Support — Info docs knowledge base + RAG grounding.
-- Apply on the dedicated tau-support Supabase project after 001–004
-- (005 is optional: this migration creates kb_chunks if missing).
-- Extends kb_chunks to accept source_type='info_doc' and adds Storage for pasted images.

-- ============================================================
-- TABLE: info_docs
-- ============================================================
create table if not exists info_docs (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null default '',
  position     int not null default 0,
  lang         text,
  content_hash text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_info_docs_position on info_docs(position);
create index if not exists idx_info_docs_content_hash on info_docs(content_hash);

drop trigger if exists info_docs_updated_at on info_docs;
create trigger info_docs_updated_at
before update on info_docs
for each row execute function set_updated_at();

alter table info_docs enable row level security;

drop policy if exists "anon_authenticated_all" on info_docs;
create policy "anon_authenticated_all" on info_docs
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on table info_docs to anon, authenticated;
grant all on table info_docs to service_role;

-- ============================================================
-- kb_chunks: create if missing (covers projects that never ran 005),
-- then allow source_type = 'info_doc'
-- ============================================================
create extension if not exists vector with schema extensions;

-- course_id is text (Open edX course key) with NO FK to courses(id).
-- Some projects have courses.id as uuid; a FK would fail type checks.
-- The app still filters/stores course keys as text when present.
create table if not exists kb_chunks (
  id           uuid primary key default gen_random_uuid(),
  source_type  text not null check (source_type in ('qa_pair', 'info_doc')),
  source_id    text not null,
  course_id    text,
  content      text not null,
  content_hash text not null,
  lang         text,
  metadata     jsonb not null default '{}'::jsonb,
  embedding    extensions.vector(1536) not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (source_type, source_id)
);

create index if not exists idx_kb_chunks_course_id on kb_chunks(course_id);
create index if not exists idx_kb_chunks_content_hash on kb_chunks(content_hash);

create index if not exists kb_chunks_embedding_hnsw
  on kb_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

drop trigger if exists kb_chunks_updated_at on kb_chunks;
create trigger kb_chunks_updated_at
before update on kb_chunks
for each row execute function set_updated_at();

alter table kb_chunks enable row level security;

drop policy if exists "anon_authenticated_all" on kb_chunks;
create policy "anon_authenticated_all" on kb_chunks
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on table kb_chunks to anon, authenticated;
grant all on table kb_chunks to service_role;

-- If the table already existed from 005 with source_type in ('qa_pair') only,
-- widen the check constraint. (No-op / safe when created above with both types.)
alter table kb_chunks drop constraint if exists kb_chunks_source_type_check;
alter table kb_chunks
  add constraint kb_chunks_source_type_check
  check (source_type in ('qa_pair', 'info_doc'));

-- ============================================================
-- match_kb_chunks — return source_type + optional source-type filter
-- ============================================================
-- Drop both the old 4-arg signature (from 005) and any prior 5-arg version.
drop function if exists match_kb_chunks(extensions.vector, int, text, float);
drop function if exists match_kb_chunks(extensions.vector, int, text, float, text[]);

create or replace function match_kb_chunks (
  query_embedding extensions.vector(1536),
  match_count int default 5,
  filter_course_id text default null,
  match_threshold float default 0.3,
  filter_source_types text[] default null
)
returns table (
  id uuid,
  source_id text,
  source_type text,
  content text,
  metadata jsonb,
  lang text,
  course_id text,
  similarity float
)
language sql
stable
set search_path = public, extensions
as $$
  select
    kb.id,
    kb.source_id,
    kb.source_type,
    kb.content,
    kb.metadata,
    kb.lang,
    kb.course_id,
    (1 - (kb.embedding <=> query_embedding))::float as similarity
  from kb_chunks kb
  where
    (filter_course_id is null or kb.course_id = filter_course_id)
    and (filter_source_types is null or kb.source_type = any(filter_source_types))
    and (1 - (kb.embedding <=> query_embedding)) > match_threshold
  order by kb.embedding <=> query_embedding
  limit least(match_count, 50);
$$;

grant execute on function match_kb_chunks(extensions.vector, int, text, float, text[])
  to anon, authenticated;

-- ============================================================
-- Storage bucket for pasted info-doc images
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'info-doc-images',
  'info-doc-images',
  true,
  10485760, -- 10 MB
  array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read
drop policy if exists "info_doc_images_public_read" on storage.objects;
create policy "info_doc_images_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'info-doc-images');

-- Anon/authenticated insert (staff tool; paste-to-upload from the SPA)
drop policy if exists "info_doc_images_anon_insert" on storage.objects;
create policy "info_doc_images_anon_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'info-doc-images');

-- Upsert needs UPDATE + SELECT as well
drop policy if exists "info_doc_images_anon_update" on storage.objects;
create policy "info_doc_images_anon_update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'info-doc-images')
  with check (bucket_id = 'info-doc-images');

drop policy if exists "info_doc_images_anon_delete" on storage.objects;
create policy "info_doc_images_anon_delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'info-doc-images');

-- Force PostgREST to pick up new tables/columns immediately.
notify pgrst, 'reload schema';
