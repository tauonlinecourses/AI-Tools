-- TAU Support — shared homepage "last בדוק הכל" timestamp across browsers.
-- Singleton row (id = 'singleton') so localhost and Vercel show the same
-- "העדכון האחרון היה ב" time. Safe to re-run.

create table if not exists last_check_all (
  id           text primary key default 'singleton'
                 check (id = 'singleton'),
  completed_at timestamptz not null,
  scanned      int not null default 0,
  total        int not null default 0,
  upserted     int not null default 0,
  incomplete   boolean not null default false,
  updated_at   timestamptz not null default now()
);

drop trigger if exists last_check_all_updated_at on last_check_all;
create trigger last_check_all_updated_at
before update on last_check_all
for each row execute function set_updated_at();

alter table last_check_all enable row level security;

drop policy if exists "anon_authenticated_all" on last_check_all;
create policy "anon_authenticated_all" on last_check_all
  for all to anon, authenticated using (true) with check (true);
