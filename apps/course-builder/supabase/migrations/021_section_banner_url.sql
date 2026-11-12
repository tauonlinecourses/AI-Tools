-- Lesson-wide banner image URL on sections (synced to each page's first banner).

alter table sections
  add column if not exists banner_image_url text;
