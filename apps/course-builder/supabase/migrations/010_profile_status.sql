-- Profile approval status for invite + self-register flows.

alter table public.profiles
  add column if not exists status text not null default 'approved';

alter table public.profiles
  add column if not exists requested_group_id uuid references public.groups (id) on delete set null;

alter table public.profiles
  add column if not exists reviewed_at timestamptz;

alter table public.profiles
  add column if not exists reviewed_by uuid references public.profiles (id) on delete set null;

alter table public.profiles
  drop constraint if exists profiles_status_check;

alter table public.profiles
  add constraint profiles_status_check
  check (status in ('pending', 'approved', 'rejected'));

create index if not exists idx_profiles_status on public.profiles (status);

-- display_name = email local-part; status / requested_group_id from signup metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_status text;
  meta_group text;
  next_status text;
  next_group uuid;
begin
  meta_status := coalesce(new.raw_user_meta_data ->> 'status', '');
  if meta_status in ('pending', 'approved', 'rejected') then
    next_status := meta_status;
  else
    next_status := 'approved';
  end if;

  meta_group := coalesce(new.raw_user_meta_data ->> 'requested_group_id', '');
  if meta_group ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    next_group := meta_group::uuid;
  else
    next_group := null;
  end if;

  insert into public.profiles (id, display_name, status, requested_group_id)
  values (
    new.id,
    split_part(coalesce(new.email, ''), '@', 1),
    next_status,
    next_group
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
