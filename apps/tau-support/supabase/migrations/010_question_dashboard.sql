-- TAU Support: question dashboard (repeated questions, categories, 3D map).
-- Additive only: does not touch kb_chunks or the RAG search.
--
-- question_embeddings  one vector per student question (no staff answer mixed
--                      in), for answered and unanswered threads alike.
-- question_dashboard_snapshot  latest computed clusters + 3D positions, so the
--                      page loads without recomputing or calling AI.

create table if not exists public.question_embeddings (
  thread_id     text primary key references public.threads(campus_thread_id) on delete cascade,
  course_id     text not null references public.courses(id) on delete cascade,
  question_text text not null,
  content_hash  text not null,
  -- text-embedding-3-small shortened to 256 dims and re-normalized.
  embedding     extensions.vector(256) not null,
  updated_at    timestamptz not null default now()
);

create index if not exists idx_question_embeddings_course
  on public.question_embeddings(course_id);

create table if not exists public.question_dashboard_snapshot (
  id          text primary key default 'singleton' check (id = 'singleton'),
  computed_at timestamptz not null default now(),
  payload     jsonb not null
);

-- Same model as 008: no anon/authenticated policies, BFF uses service_role.
alter table public.question_embeddings enable row level security;
alter table public.question_dashboard_snapshot enable row level security;
grant all on table public.question_embeddings to service_role;
grant all on table public.question_dashboard_snapshot to service_role;

notify pgrst, 'reload schema';
