-- TAU Support — Phase 1 init migration.
-- Apply against a fresh dedicated tau-support Supabase project.
-- Mirrors supabase/schema.sql (the canonical reference). See that file for
-- design notes. Safe to re-run (idempotent: if-not-exists / drop-if-exists).

-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists pgcrypto;                       -- gen_random_uuid()
create extension if not exists vector with schema extensions;  -- Phase 2 RAG (no columns yet)

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists courses (
  id             text primary key,
  name           text not null,
  name_he        text,
  forum_category text,
  last_checked_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists threads (
  campus_thread_id text primary key,
  course_id        text not null references courses(id) on delete cascade,
  title            text,
  author           text,
  author_label     text,
  body_text        text,
  body_hash        text,
  op_is_staff      boolean not null default false,
  comment_count    int,
  created_at       timestamptz,
  last_activity_at timestamptz,
  raw              jsonb,
  synced_at        timestamptz not null default now(),
  no_answer_needed boolean not null default false,
  seen_at          timestamptz,
  is_new           boolean not null default false,
  is_updated       boolean not null default false
);

create table if not exists messages (
  campus_comment_id text primary key,
  thread_id         text not null references threads(campus_thread_id) on delete cascade,
  parent_id         text,
  author            text,
  author_label      text,
  is_staff          boolean not null default false,
  endorsed          boolean not null default false,
  body_text         text,
  body_hash         text,
  created_at        timestamptz,
  raw               jsonb,
  synced_at         timestamptz not null default now()
);

create table if not exists qa_pairs (
  id                uuid primary key default gen_random_uuid(),
  thread_id         text not null unique references threads(campus_thread_id) on delete cascade,
  course_id         text not null references courses(id) on delete cascade,
  question_text     text not null,
  answer_text       text not null,
  resolution_text   text,
  answer_message_id text references messages(campus_comment_id) on delete set null,
  answer_selection  text check (answer_selection in ('endorsed', 'first_staff')),
  lang              text,
  content_hash      text,
  answered_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_threads_course_id     on threads(course_id);
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
-- RLS (open policies until auth is added)
-- ============================================================
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
