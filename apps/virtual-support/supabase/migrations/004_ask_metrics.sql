-- Virtual Support — Dashboard Stage A: per-request metrics on ask_log.
--
-- Adds latency per stage, token usage, cost and errors to every Ask row so the
-- admin dashboard can chart health, retrieval, user feedback and spend.
-- Rows logged before this migration keep NULLs and are left out of the
-- latency / token / cost charts.
--
-- outcome gains 'error': the request failed (answer = '', error_message set).

alter table public.ask_log
  -- { rewrite, embed, search, answer, total } in milliseconds; a stage that
  -- did not run is missing from the object.
  add column if not exists latency_ms     jsonb,
  add column if not exists total_ms       integer,
  -- [{ stage, model, inputTokens, outputTokens }] one entry per model call
  add column if not exists usage          jsonb not null default '[]'::jsonb,
  add column if not exists input_tokens   integer,
  add column if not exists output_tokens  integer,
  add column if not exists embed_tokens   integer,
  -- Estimated from server/pricing.ts at the time of the request.
  add column if not exists cost_usd       numeric(12, 6),
  add column if not exists error_message  text;

alter table public.ask_log drop constraint if exists ask_log_outcome_check;
alter table public.ask_log add constraint ask_log_outcome_check
  check (outcome in ('answered', 'refused', 'no_match', 'uncited', 'error'));

notify pgrst, 'reload schema';
