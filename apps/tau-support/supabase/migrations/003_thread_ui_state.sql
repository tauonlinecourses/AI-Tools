-- TAU Support — persist shared inbox UX flags on threads.
-- Safe to re-run.

alter table threads
  add column if not exists no_answer_needed boolean not null default false;

alter table threads
  add column if not exists seen_at timestamptz;

alter table threads
  add column if not exists is_new boolean not null default false;

alter table threads
  add column if not exists is_updated boolean not null default false;

create index if not exists idx_threads_no_answer_needed
  on threads(no_answer_needed)
  where no_answer_needed = true;
