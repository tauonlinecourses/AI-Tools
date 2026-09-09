-- TAU Support — Phase 2: kb_chunks vector table + similarity RPC.
-- Apply on the dedicated tau-support Supabase project after 001–004.
-- Requires the `vector` extension (already enabled in 001_init).

-- ============================================================
-- TABLE
-- ============================================================
create table if not exists kb_chunks (
  id          uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('qa_pair')),
  source_id   text not null,   -- qa_pairs.id::text
  course_id   text references courses(id) on delete cascade,
  content     text not null,
  content_hash text not null,
  lang        text,
  metadata    jsonb not null default '{}'::jsonb,
  embedding   extensions.vector(1536) not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (source_type, source_id)
);

create index if not exists idx_kb_chunks_course_id on kb_chunks(course_id);
create index if not exists idx_kb_chunks_content_hash on kb_chunks(content_hash);

-- HNSW for cosine similarity search (pgvector)
create index if not exists kb_chunks_embedding_hnsw
  on kb_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

drop trigger if exists kb_chunks_updated_at on kb_chunks;
create trigger kb_chunks_updated_at
before update on kb_chunks
for each row execute function set_updated_at();

-- ============================================================
-- RLS
-- ============================================================
alter table kb_chunks enable row level security;

drop policy if exists "anon_authenticated_all" on kb_chunks;
create policy "anon_authenticated_all" on kb_chunks
  for all to anon, authenticated using (true) with check (true);

-- ============================================================
-- match_kb_chunks — cosine similarity, optional course filter in-SQL
-- ============================================================
create or replace function match_kb_chunks (
  query_embedding extensions.vector(1536),
  match_count int default 5,
  filter_course_id text default null,
  match_threshold float default 0.3
)
returns table (
  id uuid,
  source_id text,
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
    kb.content,
    kb.metadata,
    kb.lang,
    kb.course_id,
    (1 - (kb.embedding <=> query_embedding))::float as similarity
  from kb_chunks kb
  where
    (filter_course_id is null or kb.course_id = filter_course_id)
    and (1 - (kb.embedding <=> query_embedding)) > match_threshold
  order by kb.embedding <=> query_embedding
  limit least(match_count, 50);
$$;

grant execute on function match_kb_chunks(extensions.vector, int, text, float)
  to anon, authenticated;
