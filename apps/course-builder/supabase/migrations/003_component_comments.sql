-- Per-block Word-style comments (one chronological thread per component).
-- author_role mirrors CourseViewMode: edit | implement | review.
-- resolved_at null = open; set to mark resolved. Does not bump components.updated_at.

create table component_comments (
  id uuid primary key default gen_random_uuid(),
  component_id uuid not null references components(id) on delete cascade,
  author_role text not null check (author_role in ('edit', 'implement', 'review')),
  body text not null,
  resolved_at timestamptz,
  created_at timestamptz default now()
);

create index idx_component_comments_component_id on component_comments(component_id);
