-- TAU Support — Phase 1 schema (Campus IL forum persistence + Q↔A pairs)
-- Source of truth for the dedicated tau-support Supabase project.
-- The applyable copy lives in migrations/001_init.sql (identical). Apply that
-- against a fresh project; keep this file in sync as the canonical reference.
--
-- Phase 1: durable store for polled threads/messages + deterministic Q↔A pairs.
-- Phase 2: kb_chunks holds embeddings (see below / migrations/002_kb_chunks.sql).

-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists pgcrypto;                       -- gen_random_uuid()
create extension if not exists vector with schema extensions;  -- kb_chunks embeddings

-- ============================================================
-- TABLES
-- ============================================================

-- Course catalog mirror (id = Open edX course key from courses.json).
create table if not exists courses (
  id             text primary key,
  name           text not null,
  name_he        text,
  forum_category text,
  last_checked_at timestamptz,         -- poll watermark (incremental since=)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- One row per Campus IL discussion thread (the original post / question).
create table if not exists threads (
  campus_thread_id text primary key,
  course_id        text not null references courses(id) on delete cascade,
  title            text,
  author           text,
  author_label     text,
  body_text        text,               -- plain-text OP body (RAG-ready)
  body_hash        text,               -- change detection for re-embedding
  op_is_staff      boolean not null default false,
  comment_count    int,
  created_at       timestamptz,        -- Campus IL created_at
  last_activity_at timestamptz,
  raw              jsonb,              -- full Open edX thread object
  synced_at        timestamptz not null default now(),
  -- Shared inbox UX (staff tool — same across browsers)
  no_answer_needed boolean not null default false,
  seen_at          timestamptz,
  is_new           boolean not null default false,
  is_updated       boolean not null default false
);

-- One row per comment/reply, flattened from the Open edX comment forest.
create table if not exists messages (
  campus_comment_id text primary key,
  thread_id         text not null references threads(campus_thread_id) on delete cascade,
  parent_id         text,             -- parent comment id (null = top-level reply)
  author            text,
  author_label      text,
  is_staff          boolean not null default false,
  endorsed          boolean not null default false,
  body_text         text,             -- plain-text reply body
  body_hash         text,
  created_at        timestamptz,
  raw               jsonb,
  synced_at         timestamptz not null default now()
);

-- Deterministic student-question ↔ staff-answer pair (one per answered thread).
-- This is the primary retrieval unit for the future RAG layer.
create table if not exists qa_pairs (
  id                uuid primary key default gen_random_uuid(),
  thread_id         text not null unique references threads(campus_thread_id) on delete cascade,
  course_id         text not null references courses(id) on delete cascade,
  question_text     text not null,    -- title + OP body (plain text)
  answer_text       text not null,    -- selected staff reply (plain text)
  resolution_text   text,             -- full transcript: question + all staff replies
  answer_message_id text references messages(campus_comment_id) on delete set null,
  answer_selection  text check (answer_selection in ('endorsed', 'first_staff')),
  lang              text,             -- 'he' | 'en' | 'mixed'
  content_hash      text,             -- hash(question_text || answer_text) for idempotent embedding
  answered_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Phase 2: one embeddable unit per row (whole Q↔A pair; word_doc later).
create table if not exists kb_chunks (
  id           uuid primary key default gen_random_uuid(),
  source_type  text not null check (source_type in ('qa_pair')),
  source_id    text not null,   -- qa_pairs.id::text
  course_id    text references courses(id) on delete cascade,
  content      text not null,
  content_hash text not null,
  lang         text,
  metadata     jsonb not null default '{}'::jsonb,
  embedding    extensions.vector(1536) not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (source_type, source_id)
);

-- Singleton homepage "last בדוק הכל / בדיקת שאלות חדשות" run (shared across browsers).
create table if not exists last_check_all (
  id           text primary key default 'singleton'
                 check (id = 'singleton'),
  completed_at timestamptz not null,
  scanned      int not null default 0,
  total        int not null default 0,
  upserted     int not null default 0,
  incomplete   boolean not null default false,
  updated_at   timestamptz not null default now()
);

-- ============================================================
-- INDEXES (foreign keys aren't auto-indexed in Postgres)
-- ============================================================
create index if not exists idx_threads_course_id     on threads(course_id);
create index if not exists idx_threads_no_answer_needed
  on threads(no_answer_needed) where no_answer_needed = true;
create index if not exists idx_messages_thread_id     on messages(thread_id);
create index if not exists idx_qa_pairs_course_id     on qa_pairs(course_id);
create index if not exists idx_qa_pairs_content_hash  on qa_pairs(content_hash);
create index if not exists idx_kb_chunks_course_id     on kb_chunks(course_id);
create index if not exists idx_kb_chunks_content_hash  on kb_chunks(content_hash);
create index if not exists kb_chunks_embedding_hnsw
  on kb_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

-- ============================================================
-- AUTO-UPDATE updated_at
-- ============================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql
set search_path = public;

drop trigger if exists courses_updated_at on courses;
create trigger courses_updated_at
before update on courses
for each row execute function set_updated_at();

drop trigger if exists qa_pairs_updated_at on qa_pairs;
create trigger qa_pairs_updated_at
before update on qa_pairs
for each row execute function set_updated_at();

drop trigger if exists last_check_all_updated_at on last_check_all;
create trigger last_check_all_updated_at
before update on last_check_all
for each row execute function set_updated_at();

drop trigger if exists kb_chunks_updated_at on kb_chunks;
create trigger kb_chunks_updated_at
before update on kb_chunks
for each row execute function set_updated_at();

-- ============================================================
-- RLS (open policies until auth is added — internal staff tool)
-- ============================================================
-- RLS is enabled so the Data API doesn't treat these as "RLS disabled".
-- Policies allow full CRUD for anon / authenticated, matching the no-login
-- SPA. The anon key can read/write every row; the service_role key must NEVER
-- ship to the browser. Tighten to authenticated-only when adding staff login.

alter table courses  enable row level security;
alter table threads  enable row level security;
alter table messages enable row level security;
alter table qa_pairs enable row level security;
alter table kb_chunks enable row level security;
alter table last_check_all enable row level security;

drop policy if exists "anon_authenticated_all" on courses;
create policy "anon_authenticated_all" on courses
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon_authenticated_all" on threads;
create policy "anon_authenticated_all" on threads
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon_authenticated_all" on messages;
create policy "anon_authenticated_all" on messages
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon_authenticated_all" on qa_pairs;
create policy "anon_authenticated_all" on qa_pairs
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon_authenticated_all" on kb_chunks;
create policy "anon_authenticated_all" on kb_chunks
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon_authenticated_all" on last_check_all;
create policy "anon_authenticated_all" on last_check_all
  for all to anon, authenticated using (true) with check (true);

-- ============================================================
-- Phase 2 similarity search (cosine); course filter pushed into SQL
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
