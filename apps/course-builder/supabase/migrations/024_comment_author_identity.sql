-- Personal author identity on comments (display name in thread header).
-- author_role remains for permissions / color; name is a snapshot at post time.

alter table public.component_comments
  add column if not exists author_user_id uuid references public.profiles (id) on delete set null,
  add column if not exists author_display_name text;

alter table public.page_comments
  add column if not exists author_user_id uuid references public.profiles (id) on delete set null,
  add column if not exists author_display_name text;
