-- Stable @mentions on comments (visual only; no notifications).
-- mentions jsonb: [{ "user_id": "<uuid>", "display_name": "<text>" }, ...]
-- list_tool_users: approved users with the given tool (bypasses profiles own-row RLS).

alter table public.component_comments
  add column if not exists mentions jsonb not null default '[]'::jsonb;

alter table public.page_comments
  add column if not exists mentions jsonb not null default '[]'::jsonb;

create or replace function public.list_tool_users(
  p_tool_id text default 'course-builder'
)
returns table (id uuid, display_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.user_has_tool_access(p_tool_id, auth.uid()) then
    raise exception 'No access to tool: %', p_tool_id;
  end if;

  return query
  select u.id, u.display_name
  from (
    select distinct
      p.id,
      coalesce(nullif(trim(p.display_name), ''), p.id::text) as display_name
    from public.profiles p
    join public.group_members gm on gm.user_id = p.id
    join public.group_tools gt on gt.group_id = gm.group_id
    where gt.tool_id = p_tool_id
      and p.status = 'approved'
  ) u
  order by u.display_name;
end;
$$;

revoke all on function public.list_tool_users(text) from public;
grant execute on function public.list_tool_users(text) to authenticated;
