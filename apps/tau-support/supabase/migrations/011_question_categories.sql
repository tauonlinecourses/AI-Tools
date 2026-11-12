-- TAU Support: one saved category per student question (question dashboard).
-- Additive only. The dashboard sorts each question with a small AI model once
-- and keeps the answer here, so a refresh only sorts new or edited questions.
--
-- category      one of the fixed names in src/lib/categoryColors.ts
-- category_key  content_hash + prompt version at sorting time; a mismatch
--               means the question (or the sorting prompt) changed since.

alter table public.question_embeddings
  add column if not exists category     text,
  add column if not exists category_key text;

notify pgrst, 'reload schema';
