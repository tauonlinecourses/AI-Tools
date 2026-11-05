-- Normalize the Admin group slug to a stable form that survives hub Admin UI
-- slugify(). Editing the group previously rewrote "Admin (all tools)" →
-- "admin-all-tools", which broke isAdmin / the header admin button.
-- Hub auth accepts both forms; this migration pins the DB to the canonical slug.

update public.groups
set slug = 'admin-all-tools'
where slug = 'Admin (all tools)'
  and not exists (
    select 1 from public.groups g2 where g2.slug = 'admin-all-tools'
  );
