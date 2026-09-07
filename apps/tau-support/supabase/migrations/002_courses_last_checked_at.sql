-- TAU Support — add poll watermark on courses for cross-browser incremental sync.
-- Safe to re-run.

alter table courses
  add column if not exists last_checked_at timestamptz;
