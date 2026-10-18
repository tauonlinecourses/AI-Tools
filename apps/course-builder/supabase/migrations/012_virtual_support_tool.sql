-- Allow virtual-support in group_tools and grant it to shared staff groups.

alter table public.group_tools
  drop constraint if exists group_tools_tool_id_check;

alter table public.group_tools
  add constraint group_tools_tool_id_check check (
    tool_id in (
      'video-curator',
      'course-builder',
      'mbz-explorer',
      'tau-support',
      'virtual-support',
      'tool-starter'
    )
  );

-- Grant to admin / transitional all-staff / learning-systems (slug may be
-- historical `all-staff`, legacy `Admin (all tools)`, or canonical `admin-all-tools`).
insert into public.group_tools (group_id, tool_id)
select g.id, 'virtual-support'
from public.groups g
where g.slug in (
  'all-staff',
  'Admin (all tools)',
  'admin-all-tools',
  'learning-systems-team'
)
on conflict do nothing;
