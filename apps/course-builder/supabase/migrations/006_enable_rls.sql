-- Option B: turn RLS on without adding login.
-- Policies allow full CRUD for `anon` and `authenticated`, so the current
-- no-auth SPA keeps working. The anon key can still read/write every row.
-- Replace these policies with authenticated-only when adding users.

alter table public.courses enable row level security;
alter table public.sections enable row level security;
alter table public.pages enable row level security;
alter table public.components enable row level security;
alter table public.component_comments enable row level security;

drop policy if exists "anon_authenticated_all" on public.courses;
create policy "anon_authenticated_all" on public.courses
  for all to anon, authenticated
  using (true) with check (true);

drop policy if exists "anon_authenticated_all" on public.sections;
create policy "anon_authenticated_all" on public.sections
  for all to anon, authenticated
  using (true) with check (true);

drop policy if exists "anon_authenticated_all" on public.pages;
create policy "anon_authenticated_all" on public.pages
  for all to anon, authenticated
  using (true) with check (true);

drop policy if exists "anon_authenticated_all" on public.components;
create policy "anon_authenticated_all" on public.components
  for all to anon, authenticated
  using (true) with check (true);

drop policy if exists "anon_authenticated_all" on public.component_comments;
create policy "anon_authenticated_all" on public.component_comments
  for all to anon, authenticated
  using (true) with check (true);

-- Views must use the querying role's RLS, not the view owner's.
alter view public.component_status set (security_invoker = true);
alter view public.page_status set (security_invoker = true);
alter view public.section_status set (security_invoker = true);

alter function public.set_updated_at() set search_path = public;
alter function public.mark_component_implemented(uuid) set search_path = public;
