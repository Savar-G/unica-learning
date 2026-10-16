-- #191 approved corrections. Additive: no data changes, no deletion, no change to #78 request/lease functions.
-- Apply after add_customer_retention. Keep old booking customers unknown until their link is verified in Stripe.
create function public.family_retention_cards(p uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(f.card), '[]'::jsonb) from (
    select jsonb_build_object('customer', c.stripe_customer_id, 'saved', c.card_saved_at is not null) as card
      from public.card_setups c where c.parent_id = p
        and (c.stripe_customer_id is not null or c.card_saved_at is not null)
    union all
    select jsonb_build_object('customer', null, 'saved', false, 'booking',
      case when s.ref is not null and u.email_confirmed_at is not null
        and lower(u.email) = lower(parent.email) and lower(s.email) = lower(u.email)
      then jsonb_build_object('email', s.email, 'ref', s.ref) else 'null'::jsonb end)
      from public.parents parent left join auth.users u on u.id = parent.id
      join public.signups s on lower(s.email) = lower(parent.email) or lower(s.email) = lower(u.email)
      where parent.id = p
  ) f;
$$;

-- Include bookings even when there is no report card row and no old test. Queue and keyset order are unchanged.
create or replace function public.family_retention_candidates(after_id uuid, page_size integer default 100)
returns table(parent_id uuid, queued boolean, last_activity timestamptz, cards jsonb)
language sql security definer set search_path = '' as $$
  select e.id, exists(select 1 from public.family_deletions d where d.parent_id = e.id),
    public.family_last_activity(e.id), public.family_retention_cards(e.id)
  from (
    select d.parent_id as id from public.family_deletions d
    union
    select p.id from public.parents p
    where not exists(select 1 from public.admin_users a where a.user_id = p.id)
      and (public.family_retention_due(p.id) or public.family_retention_cards(p.id) <> '[]'::jsonb)
  ) e
  where after_id is null or e.id > after_id
  order by e.id limit least(greatest(page_size, 1), 100);
$$;

-- Six UTC calendar months after Stripe's latest end. Later tests do not extend this deadline.
-- The fresh payment check still verifies all report and booking customers after the freeze.
create or replace function public.claim_family_retention(p uuid, token uuid, subscription_ended_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare exists_parent boolean;
begin
  perform 1 from public.parents where id = p for update;
  exists_parent := found;
  if subscription_ended_at is null or exists(select 1 from public.family_deletions where parent_id = p) then
    return public.claim_family_deletion(p, token);
  end if;
  if not exists_parent
    or exists(select 1 from public.admin_users where user_id = p)
    or exists(select 1 from public.family_card_operations where parent_id = p)
    or public.family_retention_cards(p) = '[]'::jsonb
    or subscription_ended_at > now()
    or subscription_ended_at + interval '6 months' > now() then
    return jsonb_build_object('state', 'excluded');
  end if;
  update public.parents set deletion_requested_at = now() where id = p;
  insert into public.family_deletions(parent_id, reason) values (p, 'retention');
  return public.claim_family_deletion(p, token);
end $$;

revoke all on function public.family_retention_cards(uuid), public.family_retention_candidates(uuid, integer),
  public.claim_family_retention(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.family_retention_cards(uuid), public.family_retention_candidates(uuid, integer),
  public.claim_family_retention(uuid, uuid, timestamptz) to service_role;
