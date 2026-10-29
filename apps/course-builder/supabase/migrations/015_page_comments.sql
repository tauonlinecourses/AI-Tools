-- Word-style comments on a page (header thread), same shape as component_comments.
-- author_role mirrors CourseViewMode: edit | implement | review.
-- resolved_at null = open. Does not bump pages or course updated_at.

create table if not exists page_comments (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references pages(id) on delete cascade,
  author_role text not null check (author_role in ('edit', 'implement', 'review')),
  body text not null,
  resolved_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_page_comments_page_id on page_comments(page_id);

alter table page_comments enable row level security;

drop policy if exists "authenticated_all" on page_comments;
create policy "authenticated_all" on page_comments
  for all to authenticated
  using (true)
  with check (true);
