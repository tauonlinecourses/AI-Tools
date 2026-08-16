-- Lesson overview metadata on sections (dates + files folder link).

alter table sections
  add column if not exists opens_at date,
  add column if not exists assignments_due_at date,
  add column if not exists files_folder_url text;
