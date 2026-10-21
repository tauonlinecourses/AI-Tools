-- Pin one info-doc topic to the top of the list and open it by default.

alter table info_docs
  add column if not exists pinned boolean not null default false;

comment on column info_docs.pinned is
  'When true, topic sorts first in the sidebar and opens by default in docs mode. At most one row should be pinned.';

-- At most one pinned topic.
create unique index if not exists info_docs_one_pinned
  on info_docs ((pinned))
  where pinned = true;

-- Seed: pin the intro topic if it exists.
update info_docs
set pinned = true
where title = 'הקדמה - חשוב לקרוא!'
  and not exists (select 1 from info_docs where pinned = true);

notify pgrst, 'reload schema';
