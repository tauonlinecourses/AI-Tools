-- Add dictionary-tool to allowed group_tools.tool_id values and seed staff groups.
-- Keep `virtual-support` in the check: it exists in production rows even though
-- it is not currently listed in PLATFORM_TOOL_IDS / the hub catalog.

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
      'tool-starter',
      'dictionary-tool'
    )
  );

insert into public.group_tools (group_id, tool_id)
select g.id, 'dictionary-tool'
from public.groups g
where g.slug in ('all-staff', 'admin-all-tools')
on conflict do nothing;
