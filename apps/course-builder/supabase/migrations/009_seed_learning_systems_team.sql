-- Seed permission group: צוות מערכות למידה
-- Tools: tau-support + course-builder only

insert into public.groups (name, slug, description)
values (
  'צוות מערכות למידה',
  'learning-systems-team',
  'Access to tau-support and course-builder only'
)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description;

insert into public.group_tools (group_id, tool_id)
select g.id, t.tool_id
from public.groups g
cross join (
  values
    ('tau-support'),
    ('course-builder')
) as t(tool_id)
where g.slug = 'learning-systems-team'
on conflict do nothing;
