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

-- Stage 1 hybrid search (see migrations/002_hybrid_search.sql).
alter table public.doc_chunks
  add column if not exists content_tsv tsvector
  generated always as (to_tsvector('simple', content)) stored;

create index if not exists doc_chunks_content_tsv_gin
  on public.doc_chunks
  using gin (content_tsv);

-- ============================================================
-- match_doc_chunks_hybrid — vector + keyword search, fused with RRF
-- ============================================================
-- query_text: space-separated search terms; they are OR-ed together.
-- Returns up to match_count chunks ordered by rrf_score. `similarity` is the
-- cosine similarity for every returned row (also keyword-only hits), and
-- `keyword_rank` is ts_rank_cd (0 when the chunk did not match any term).
drop function if exists public.match_doc_chunks_hybrid(extensions.vector, text, int, int);

create or replace function public.match_doc_chunks_hybrid (
  query_embedding extensions.vector(1536),
  query_text text,
  match_count int default 20,
  rrf_k int default 60
)
returns table (
  id uuid,
  document_id uuid,
  chunk_index int,
  content text,
  similarity float,
  keyword_rank float,
  rrf_score float
)
language sql
stable
set search_path = public, extensions
as $$
  with params as (
    select least(greatest(match_count, 1), 50) as n
  ),
  q as (
    -- plainto_tsquery escapes the terms safely; swap AND for OR.
    select to_tsquery(
      'simple',
      replace(plainto_tsquery('simple', coalesce(query_text, ''))::text, '&', '|')
    ) as tsq
  ),
  semantic_raw as (
    select dc.id, dc.embedding <=> query_embedding as distance
    from public.doc_chunks dc
    order by dc.embedding <=> query_embedding
    limit (select n * 2 from params)
  ),
  semantic as (
    select id, row_number() over (order by distance) as rnk
    from semantic_raw
  ),
  keyword_raw as (
    select dc.id, ts_rank_cd(dc.content_tsv, q.tsq) as kw
    from public.doc_chunks dc, q
    where q.tsq is not null and dc.content_tsv @@ q.tsq
    order by kw desc
    limit (select n * 2 from params)
  ),
  keyword as (
    select id, kw, row_number() over (order by kw desc) as rnk
    from keyword_raw
  ),
  fused as (
    select
      coalesce(s.id, k.id) as id,
      coalesce(k.kw, 0)::float as keyword_rank,
      (
        coalesce(1.0 / (rrf_k + s.rnk), 0)
        + coalesce(1.0 / (rrf_k + k.rnk), 0)
      )::float as rrf_score
    from semantic s
    full outer join keyword k on k.id = s.id
  )
  select
    dc.id,
    dc.document_id,
    dc.chunk_index,
    dc.content,
    (1 - (dc.embedding <=> query_embedding))::float as similarity,
    f.keyword_rank,
    f.rrf_score
  from fused f
  join public.doc_chunks dc on dc.id = f.id
  order by f.rrf_score desc
  limit (select n from params);
$$;

revoke all on function public.match_doc_chunks_hybrid(extensions.vector, text, int, int)
  from public, anon, authenticated;
grant execute on function public.match_doc_chunks_hybrid(extensions.vector, text, int, int)
  to service_role;


-- Stage 3 Ask log + eval cases (see migrations/003_ask_log.sql).
create table if not exists public.ask_log (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  session_id        text,
  pipeline_version  text not null,
  question          text not null,
  search_query      text not null,
  -- answered | refused | no_match | uncited
  outcome           text not null,
  answer            text not null,
  -- [{ documentId, title, similarity, keywordRank, rrf }] sent to the model, in order
  pages_sent        jsonb not null default '[]'::jsonb,
  -- document ids cited in the answer, in citation order
  cited_document_ids uuid[] not null default '{}',
  best_similarity   float,
  vote              text check (vote in ('up', 'down')),
  vote_comment      text,
  voted_at          timestamptz,
  constraint ask_log_outcome_check
    check (outcome in ('answered', 'refused', 'no_match', 'uncited'))
);

create index if not exists idx_ask_log_created_at on public.ask_log(created_at desc);
create index if not exists idx_ask_log_session on public.ask_log(session_id, created_at);
create index if not exists idx_ask_log_vote on public.ask_log(vote) where vote is not null;

alter table public.ask_log enable row level security;
grant all on table public.ask_log to service_role;

-- ============================================================
-- VIEW: ask_log_review — log + warning flags
-- ============================================================
-- weak_match: best page only just passed the 0.3 relevance bar (< 0.35).
-- rephrased:  the next question in the same chat came within 2 minutes,
--             which usually means this answer did not help.
create or replace view public.ask_log_review
with (security_invoker = true) as
select
  l.id,
  l.created_at,
  l.vote,
  l.vote_comment,
  l.outcome,
  l.question,
  l.search_query,
  l.answer,
  l.best_similarity,
  (l.outcome in ('refused', 'no_match')) as refused,
  (l.outcome = 'uncited') as uncited,
  (l.outcome = 'answered' and coalesce(l.best_similarity, 0) < 0.35) as weak_match,
  exists (
    select 1
    from public.ask_log n
    where n.session_id = l.session_id
      and l.session_id is not null
      and n.created_at > l.created_at
      and n.created_at <= l.created_at + interval '2 minutes'
  ) as rephrased,
  l.pages_sent,
  l.cited_document_ids,
  l.pipeline_version,
  l.session_id
from public.ask_log l;

revoke all on public.ask_log_review from public, anon, authenticated;
grant select on public.ask_log_review to service_role;

-- ============================================================
-- TABLE: ask_eval_cases — re-test set
-- ============================================================
create table if not exists public.ask_eval_cases (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  question              text not null,
  -- answer | refuse
  expected_outcome      text not null check (expected_outcome in ('answer', 'refuse')),
  -- pages that should be found/cited (empty for refuse cases)
  expected_document_ids uuid[] not null default '{}',
  note                  text,
  active                boolean not null default true
);

alter table public.ask_eval_cases enable row level security;
grant all on table public.ask_eval_cases to service_role;

