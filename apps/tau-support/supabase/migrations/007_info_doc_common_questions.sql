-- TAU Support — common questions on info_docs for question-shaped RAG retrieval.
-- Apply on project gfatxeznxjplrljcohog (tau-support) after 006.

alter table info_docs
  add column if not exists common_questions text[] not null default '{}'::text[];

comment on column info_docs.common_questions is
  'Example student phrasings used for embedding/retrieval; full title+body shown on hit.';

notify pgrst, 'reload schema';
