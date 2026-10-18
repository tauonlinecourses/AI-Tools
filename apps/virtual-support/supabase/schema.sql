-- Virtual Support — canonical schema reference.
-- Prefer applying migrations/001_init.sql on a fresh project.

create extension if not exists pgcrypto;
create extension if not exists vector with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.folders (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  position   int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
