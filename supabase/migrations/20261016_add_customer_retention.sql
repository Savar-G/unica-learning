-- #191 (spec #181; updates D-085). Retention rules for customers and former customers. Additive: new functions only.
-- The deployed code keeps calling claim_family_deletion and family_deletion_candidates (#78), which this file does not
-- change. No family is claimed, frozen or deleted by this migration.
--
-- Rules: a customer (live subscription, or a saved card that waits for the first workbook) is kept. A former customer
-- is deleted 6 calendar months (UTC) after the latest subscription end in Stripe; a test after that end keeps the
-- family until 12 months after the test. A free-test family is deleted 12 months after its latest test activity
-- (family_retention_due, unchanged). Stripe holds the subscription state, so the worker reads it (read only) before
-- it claims, and reads it again after the freeze. Only that second read can start a deletion.

-- The latest test activity of a family: the same activity that family_retention_due counts (#78).
create function public.family_last_activity(p uuid) returns timestamptz
language sql security definer set search_path = '' as $$
  select max(activity.at) from (
    select greatest(started_at, completed_at, last_answer_at) as at from public.assessments where parent_id = p
    union all select answer.created_at from public.answers answer
      join public.assessments a on a.id = answer.assessment_id where a.parent_id = p
    union all select f.started_at from public.assessment_facts f
      join public.assessments a on a.id = f.assessment_id where a.parent_id = p
    union all select f.created_at from public.fact_answers f
      join public.assessments a on a.id = f.assessment_id where a.parent_id = p
  ) activity;
$$;

-- Every family the worker decides: the deletion queue, free-test families that are due, and every family with Stripe
-- history (a Stripe customer or a saved card on record). cards: one entry per such card setup row. Keyset paging.
create function public.family_retention_candidates(after_id uuid, page_size integer default 100)
returns table(parent_id uuid, queued boolean, last_activity timestamptz, cards jsonb)
language sql security definer set search_path = '' as $$
  select e.id,
    exists(select 1 from public.family_deletions d where d.parent_id = e.id),
    public.family_last_activity(e.id),
    coalesce((select jsonb_agg(jsonb_build_object('customer', c.stripe_customer_id, 'saved', c.card_saved_at is not null) order by c.id)
      from public.card_setups c where c.parent_id = e.id and (c.stripe_customer_id is not null or c.card_saved_at is not null)), '[]'::jsonb)
  from (
    select d.parent_id as id from public.family_deletions d
    union
    select p.id from public.parents p
    where not exists(select 1 from public.admin_users a where a.user_id = p.id)
      and (public.family_retention_due(p.id) or exists(select 1 from public.card_setups c
        where c.parent_id = p.id and (c.stripe_customer_id is not null or c.card_saved_at is not null)))
  ) e
  where after_id is null or e.id > after_id
  order by e.id limit least(greatest(page_size, 1), 100);
$$;

-- The worker's claim. A queued family, and a family claimed by the free-test rule (no end date), go through
-- claim_family_deletion unchanged. A former customer needs the latest subscription end that the worker read in
-- Stripe: under the parent row lock, the database checks the 6-month deadline and the test-activity rule again,
-- then freezes the family as a retention check. The worker then reads Stripe again and keeps (unfreezes) the family
-- unless the fresh state still says delete.
create function public.claim_family_retention(p uuid, token uuid, subscription_ended_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare exists_parent boolean; last timestamptz;
begin
  perform 1 from public.parents where id = p for update;
  exists_parent := found;
  if subscription_ended_at is null or exists(select 1 from public.family_deletions where parent_id = p) then
    return public.claim_family_deletion(p, token);
  end if;
  last := public.family_last_activity(p);
  if not exists_parent
    or exists(select 1 from public.admin_users where user_id = p)
    or exists(select 1 from public.family_card_operations where parent_id = p)
    or not exists(select 1 from public.card_setups where parent_id = p and stripe_customer_id is not null)
    or subscription_ended_at > now()
    or subscription_ended_at + interval '6 months' > now()
    or (last is not null and last > subscription_ended_at and last + interval '12 months' > now()) then
    return jsonb_build_object('state', 'excluded');
  end if;
  update public.parents set deletion_requested_at = now() where id = p;
  insert into public.family_deletions(parent_id, reason) values (p, 'retention');
  return public.claim_family_deletion(p, token);
end $$;

revoke all on function public.family_last_activity(uuid), public.family_retention_candidates(uuid, integer),
  public.claim_family_retention(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.family_last_activity(uuid), public.family_retention_candidates(uuid, integer),
  public.claim_family_retention(uuid, uuid, timestamptz) to service_role;
