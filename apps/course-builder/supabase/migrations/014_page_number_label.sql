-- Page display numbers are not auto-generated; users put numbers in the title.
-- Drop number_label if a prior draft of this migration added it.

alter table pages
  drop column if exists number_label;
