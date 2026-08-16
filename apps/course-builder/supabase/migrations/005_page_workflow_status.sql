-- Page authoring readiness. Existing pages remain visible to implementers;
-- pages created after this migration start as in progress.

alter table pages
  add column if not exists workflow_status text;

update pages
set workflow_status = 'ready_for_implementation'
where workflow_status is null;

alter table pages
  alter column workflow_status set default 'in_progress',
  alter column workflow_status set not null;

alter table pages
  drop constraint if exists pages_workflow_status_check;

alter table pages
  add constraint pages_workflow_status_check
  check (workflow_status in ('in_progress', 'ready_for_implementation'));
