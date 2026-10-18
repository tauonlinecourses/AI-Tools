-- Tool entitlements only count for approved profiles.
-- Pending/rejected users must not pass user_has_tool_access / user_allowed_tools
-- even if leftover group_members rows exist.

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
  join public.profiles p on p.id = gm.user_id
  where gm.user_id = p_user_id
    and p.status = 'approved';
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
