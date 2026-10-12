-- Platform identity hosted in Course-Builder (hub Auth + group tool permissions).
-- Also tightens course-data RLS to authenticated-only.

-- ============================================================
-- PLATFORM TABLES
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.group_tools (
  group_id uuid not null references public.groups (id) on delete cascade,
  tool_id text not null,
  created_at timestamptz not null default now(),
  primary key (group_id, tool_id),
  constraint group_tools_tool_id_check check (
    tool_id in (
      'video-curator',
      'course-builder',
      'mbz-explorer',
      'tau-support',
      'tool-starter'
    )
  )
);

-- Short-lived one-time codes for cross-origin tool session handoff.
create table if not exists public.auth_handoff_codes (
  code text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  tool_id text not null,
  redirect_url text not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_group_members_user_id on public.group_members (user_id);
create index if not exists idx_group_tools_tool_id on public.group_tools (tool_id);
create index if not exists idx_auth_handoff_codes_expires_at
  on public.auth_handoff_codes (expires_at);

-- ============================================================
-- PROFILE ON SIGNUP
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger-only helper; must not be callable via PostgREST RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================================
-- ALLOWED TOOLS HELPERS
-- ============================================================

create or replace function public.user_allowed_tools(p_user_id uuid default auth.uid())
returns table (tool_id text)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct gt.tool_id
  from public.group_members gm
  join public.group_tools gt on gt.group_id = gm.group_id
  where gm.user_id = p_user_id;
$$;

create or replace function public.user_has_tool_access(
  p_tool_id text,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.user_allowed_tools(p_user_id) t
    where t.tool_id = p_tool_id
  );
$$;

revoke all on function public.user_allowed_tools(uuid) from public;
revoke all on function public.user_has_tool_access(text, uuid) from public;
grant execute on function public.user_allowed_tools(uuid) to authenticated, service_role;
grant execute on function public.user_has_tool_access(text, uuid) to authenticated, service_role;

-- ============================================================
-- RLS — PLATFORM TABLES
-- ============================================================

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_tools enable row level security;
alter table public.auth_handoff_codes enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists "group_members_select_own" on public.group_members;
create policy "group_members_select_own" on public.group_members
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "groups_select_member" on public.groups;
create policy "groups_select_member" on public.groups
  for select to authenticated
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = groups.id and gm.user_id = auth.uid()
    )
  );

drop policy if exists "group_tools_select_member" on public.group_tools;
create policy "group_tools_select_member" on public.group_tools
  for select to authenticated
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = group_tools.group_id and gm.user_id = auth.uid()
    )
  );

-- Handoff codes: no direct client access (hub/server uses service_role).
-- Keep RLS on with no authenticated policies.

-- ============================================================
-- COURSE DATA — authenticated only (replace open anon policies)
-- ============================================================

drop policy if exists "anon_authenticated_all" on public.courses;
drop policy if exists "anon_authenticated_all" on public.sections;
drop policy if exists "anon_authenticated_all" on public.pages;
drop policy if exists "anon_authenticated_all" on public.components;
drop policy if exists "anon_authenticated_all" on public.component_comments;

drop policy if exists "authenticated_all" on public.courses;
create policy "authenticated_all" on public.courses
  for all to authenticated
  using (true) with check (true);

drop policy if exists "authenticated_all" on public.sections;
create policy "authenticated_all" on public.sections
  for all to authenticated
  using (true) with check (true);

drop policy if exists "authenticated_all" on public.pages;
create policy "authenticated_all" on public.pages
  for all to authenticated
  using (true) with check (true);

drop policy if exists "authenticated_all" on public.components;
create policy "authenticated_all" on public.components
  for all to authenticated
  using (true) with check (true);

drop policy if exists "authenticated_all" on public.component_comments;
create policy "authenticated_all" on public.component_comments
  for all to authenticated
  using (true) with check (true);

-- ============================================================
-- SEED — all-staff group + every current tool
-- ============================================================

insert into public.groups (id, name, slug, description)
values (
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  'All staff',
  'all-staff',
  'Transitional shared group with access to every hub tool'
)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description;

insert into public.group_tools (group_id, tool_id)
select g.id, t.tool_id
from public.groups g
cross join (
  values
    ('video-curator'),
    ('course-builder'),
    ('mbz-explorer'),
    ('tau-support')
) as t(tool_id)
where g.slug = 'all-staff'
on conflict do nothing;
