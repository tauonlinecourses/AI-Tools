-- Virtual Support — knowledge base + RAG schema.
-- Apply against a fresh dedicated virtual-support Supabase project.
-- BFF uses service_role after Platform JWT + tool entitlement checks.
-- Safe to re-run (idempotent: if-not-exists / drop-if-exists).

-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists pgcrypto;
create extension if not exists vector with schema extensions;

-- ============================================================
-- HELPERS
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- TABLE: folders
-- ============================================================
create table if not exists public.folders (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  position   int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_folders_position on public.folders(position);

drop trigger if exists folders_updated_at on public.folders;
create trigger folders_updated_at
before update on public.folders
for each row execute function public.set_updated_at();

alter table public.folders enable row level security;
-- No anon/authenticated policies — service_role BFF only.
grant all on table public.folders to service_role;

-- ============================================================
-- TABLE: documents
-- ============================================================
create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  folder_id    uuid references public.folders(id) on delete set null,
  title        text not null,
  body         text not null default '',
  position     int not null default 0,
  content_hash text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_documents_folder_id on public.documents(folder_id);
create index if not exists idx_documents_position on public.documents(position);
create index if not exists idx_documents_content_hash on public.documents(content_hash);

drop trigger if exists documents_updated_at on public.documents;
create trigger documents_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

alter table public.documents enable row level security;
grant all on table public.documents to service_role;

-- ============================================================
-- TABLE: doc_chunks (vector index)
-- ============================================================
create table if not exists public.doc_chunks (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.documents(id) on delete cascade,
  chunk_index  int not null,
  content      text not null,
  content_hash text not null,
  embedding    extensions.vector(1536) not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists idx_doc_chunks_document_id on public.doc_chunks(document_id);
create index if not exists idx_doc_chunks_content_hash on public.doc_chunks(content_hash);

create index if not exists doc_chunks_embedding_hnsw
  on public.doc_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

drop trigger if exists doc_chunks_updated_at on public.doc_chunks;
create trigger doc_chunks_updated_at
before update on public.doc_chunks
for each row execute function public.set_updated_at();

alter table public.doc_chunks enable row level security;
grant all on table public.doc_chunks to service_role;

-- ============================================================
-- match_doc_chunks — cosine similarity search
-- ============================================================
drop function if exists public.match_doc_chunks(extensions.vector, int, float);

create or replace function public.match_doc_chunks (
  query_embedding extensions.vector(1536),
  match_count int default 8,
  match_threshold float default 0.3
)
returns table (
  id uuid,
  document_id uuid,
  chunk_index int,
  content text,
  similarity float
)
language sql
stable
set search_path = public, extensions
as $$
  select
    dc.id,
    dc.document_id,
    dc.chunk_index,
    dc.content,
    (1 - (dc.embedding <=> query_embedding))::float as similarity
  from public.doc_chunks dc
  where (1 - (dc.embedding <=> query_embedding)) > match_threshold
  order by dc.embedding <=> query_embedding
  limit least(match_count, 50);
$$;

revoke all on function public.match_doc_chunks(extensions.vector, int, float)
  from public, anon, authenticated;
grant execute on function public.match_doc_chunks(extensions.vector, int, float)
  to service_role;

-- ============================================================
-- Storage: doc-images (public read; writes via service_role BFF)
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'doc-images',
  'doc-images',
  true,
  10485760, -- 10 MB
  array['image/png', 'image/jpeg', 'image/gif', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "doc_images_public_read" on storage.objects;
create policy "doc_images_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'doc-images');

-- No anon/authenticated insert/update/delete — service_role bypasses RLS.

notify pgrst, 'reload schema';
