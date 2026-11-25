-- Optional Campus IL topic id for a course's technical-help forum.
-- When set, polls skip /course_topics/ and filter threads by this id.

alter table courses
  add column if not exists forum_topic_id text;
