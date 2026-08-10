-- Empty pages must report total_count = 0.
-- `count(*)` after a LEFT JOIN counts the page row itself when there are no
-- components (phantom 1 → UI shows "0/1"). Use `count(cs.id)` instead.

create or replace view page_status as
select
  p.id as page_id,
  count(*) filter (where cs.status = 'implemented') as implemented_count,
  count(*) filter (where cs.status = 'needs_update') as needs_update_count,
  count(*) filter (where cs.status = 'not_implemented') as not_implemented_count,
  count(cs.id) as total_count
from pages p
left join component_status cs on cs.page_id = p.id
group by p.id;

create or replace view section_status as
select
  s.id as section_id,
  coalesce(sum(ps.implemented_count), 0) as implemented_count,
  coalesce(sum(ps.needs_update_count), 0) as needs_update_count,
  coalesce(sum(ps.not_implemented_count), 0) as not_implemented_count,
  coalesce(sum(ps.total_count), 0) as total_count
from sections s
left join pages p on p.section_id = s.id
left join page_status ps on ps.page_id = p.id
group by s.id;
