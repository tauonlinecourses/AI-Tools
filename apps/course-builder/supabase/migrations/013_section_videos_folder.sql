-- Lesson videos folder link on sections (alongside files_folder_url).

alter table sections
  add column if not exists videos_folder_url text;
