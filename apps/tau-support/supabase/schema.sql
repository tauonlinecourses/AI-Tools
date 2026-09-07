-- TAU Support — Phase 1 schema (Campus IL forum persistence + Q↔A pairs)
-- Source of truth for the dedicated tau-support Supabase project.
-- The applyable copy lives in migrations/001_init.sql (identical). Apply that
-- against a fresh project; keep this file in sync as the canonical reference.
--
-- Phase 1 scope: durable store for polled threads/messages plus deterministic
-- staff Q↔A pairs as plain text. NO embeddings/vectors are created here — the
-- `vector` extension is enabled so Phase 2 can add a kb_chunks table without a
-- new extension migration, but no vector columns exist yet.

-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists pgcrypto;                       -- gen_random_uuid()
create extension if not exists vector with schema extensions;  -- Phase 2 RAG (no columns yet)

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

-- ============================================================
-- INDEXES (foreign keys aren't auto-indexed in Postgres)
-- ============================================================
create index if not exists idx_threads_course_id     on threads(course_id);
create index if not exists idx_threads_no_answer_needed
  on threads(no_answer_needed) where no_answer_needed = true;
create index if not exists idx_messages_thread_id     on messages(thread_id);
create index if not exists idx_qa_pairs_course_id     on qa_pairs(course_id);
create index if not exists idx_qa_pairs_content_hash  on qa_pairs(content_hash);

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
