-- The daily retention worker leaves test families (public.test_accounts) out of its own checks. A test family stays
-- in the list while it is in the deletion queue, so a deletion someone asked for still runs.
-- Why: a test family's card is often saved with a Stripe test key into this database. The worker reads Stripe with the
-- live key, which cannot see that customer, so the family was unknown on every run and the job failed every day from
-- 2026-10-19. The admin dashboard already leaves test families out of its numbers (D-099).
-- Same signature, return type and grants (create or replace keeps them). The worker code does not change.
create or replace function public.family_retention_candidates(after_id uuid, page_size integer default 100)
  returns table(parent_id uuid, queued boolean, last_activity timestamptz, cards jsonb)
  language sql security definer set search_path = ''
as $$
  select e.id, exists(select 1 from public.family_deletions d where d.parent_id = e.id),
    public.family_last_activity(e.id), public.family_retention_cards(e.id)
  from (
    select d.parent_id as id from public.family_deletions d
    union
    select p.id from public.parents p
    where not exists(select 1 from public.admin_users a where a.user_id = p.id)
      and not exists(select 1 from public.test_accounts t where t.parent_id = p.id)
      and (public.family_retention_due(p.id) or public.family_retention_cards(p.id) <> '[]'::jsonb)
  ) e
  where after_id is null or e.id > after_id
  order by e.id limit least(greatest(page_size, 1), 100);
$$;
