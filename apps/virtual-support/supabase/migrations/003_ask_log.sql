-- Virtual Support — Stage 3: anonymous Ask log, 👍/👎 feedback, re-test cases.
--
-- ask_log         one row per question asked in the app (rated or not).
--                 Anonymous: no user id/email. session_id is a random id made
--                 in the browser per page load, only to group one chat.
-- ask_log_review  ask_log + warning flags, for browsing in the table editor.
-- ask_eval_cases  re-test set used by `pnpm --filter virtual-support eval`.
--
-- Kept indefinitely for now; safe to truncate later
-- (`truncate public.ask_log;`) — nothing else references it.

-- ============================================================
-- TABLE: ask_log
-- ============================================================
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

notify pgrst, 'reload schema';
