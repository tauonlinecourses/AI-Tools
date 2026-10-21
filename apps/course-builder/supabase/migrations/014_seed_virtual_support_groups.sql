-- Grant virtual-support to shared staff groups.
-- Constraint already allows `virtual-support` via 012_add_dictionary_tool.sql.

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
