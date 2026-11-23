-- Private, per-user component templates ("save page as template").
-- Layout only: `items` is an ordered list of picker items, e.g.
--   [{"type": "text"}, {"type": "video"}, {"type": "question_single"}]
-- Each item is an object so block content can be added later without a migration.
-- Each user only sees and changes their own rows.

begin;

create table if not exists public.user_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Also serves as the owner_id index.
  unique (owner_id, name)
);

drop trigger if exists user_templates_updated_at on public.user_templates;
create trigger user_templates_updated_at
  before update on public.user_templates
  for each row execute function public.set_updated_at();

alter table public.user_templates enable row level security;

drop policy if exists "user_templates_own" on public.user_templates;
create policy "user_templates_own" on public.user_templates
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

commit;
