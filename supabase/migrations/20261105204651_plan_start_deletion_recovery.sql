-- PR #593: recover an open start left behind a deletion fence by an older deployment.
-- Keep the old reader fenced. The new reader exposes only existing open starts for a queued family.
-- Recovery may resolve that record and record its team alert. It cannot change cards, admit starts or send parent email.
-- No stored row changes when this migration is applied.
create function public.card_recovery_rows(
  p_card uuid default null, p_customer text default null,
  p_changed_after timestamptz default null, p_limit integer default 200
)
returns table (
  card_id uuid, customer text, session_id text, payment_method_id text, needs_repair boolean,
  start_generation integer, start_key text, start_card text, start_at timestamptz, start_state text, start_subscription text,
  start_first_charge timestamptz, start_finished_at timestamptz, start_email text, start_alert text, deletion_queued boolean
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.stripe_customer_id, s.session_id, s.payment_method_id, s.needs_repair,
    l.generation, l.start_key, l.payment_method_id, l.started_at, l.state, l.subscription_id,
    l.first_charge_at, l.finished_at, l.email_state, l.team_alert_state, p.deletion_requested_at is not null
  from public.child_card_updates s
  join public.card_setups c on c.child_id = s.child_id and c.parent_id = s.parent_id
  join public.parents p on p.id = s.parent_id
  left join lateral (
    select * from public.plan_starts x where x.card_setup_id = c.id order by x.generation desc limit 1
  ) l on true
  where c.stripe_customer_id is not null
    and (p.deletion_requested_at is null or l.state = 'open')
    and (
      (p_card is not null and c.id = p_card)
      or (p_customer is not null and c.stripe_customer_id = p_customer)
      or (p_card is null and p_customer is null and (
        l.state = 'open' or l.email_state = 'pending'
        or (s.payment_method_id is not null and (s.needs_repair or s.updated_at > p_changed_after))
      ))
    )
  order by s.reconciled_at asc nulls first, c.id
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
$$;
revoke all on function public.card_recovery_rows(uuid, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.card_recovery_rows(uuid, text, timestamptz, integer) to service_role;

-- Isolate the exception to this table's trigger. Every other table keeps the existing family fence.
create function public.fence_plan_start_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare deleting timestamptz;
begin
  if tg_op = 'UPDATE' then
    select deletion_requested_at into deleting from public.parents where id = old.parent_id for share;
    if not found then raise exception 'family_unavailable' using errcode = '55000'; end if;
    if deleting is not null then
      if old.state = 'open' and new.email_state = 'none'
        and (to_jsonb(new) - array['state', 'finished_at', 'subscription_id', 'first_charge_at', 'ended_by',
          'team_alert_state', 'team_alert_at', 'team_alert_email_id', 'team_alert_error'])
          = (to_jsonb(old) - array['state', 'finished_at', 'subscription_id', 'first_charge_at', 'ended_by',
          'team_alert_state', 'team_alert_at', 'team_alert_email_id', 'team_alert_error'])
        and (
          -- An open record can change only the alert fields.
          (new.state = 'open' and new.finished_at is not distinct from old.finished_at
            and new.subscription_id is not distinct from old.subscription_id
            and new.first_charge_at is not distinct from old.first_charge_at and new.ended_by is not distinct from old.ended_by)
          or (new.state in ('started', 'other') and new.subscription_id is not null and new.ended_by is null)
          or (new.state = 'refused' and new.subscription_id is null and new.first_charge_at is null and new.ended_by is null)
          or (new.state = 'team_ended' and new.subscription_id is null and new.first_charge_at is null
            and new.ended_by is not null and old.started_at <= now() - interval '24 hours')
        ) then return new;
      end if;
      raise exception 'family_unavailable' using errcode = '55000';
    end if;
    perform public.assert_family_writable(old.parent_id);
  end if;
  perform public.assert_family_writable(new.parent_id);
  return new;
end $$;
revoke all on function public.fence_plan_start_write() from public, anon, authenticated, service_role;
create or replace trigger fence_family_write before insert or update on public.plan_starts
  for each row execute function public.fence_plan_start_write();

-- Suppress parent email under the same parent lock the fence uses, including callers from an older deployment.
create or replace function public.finish_plan_start(p_card uuid, p_generation integer, p_state text, p_subscription text, p_first_charge timestamptz, p_email boolean)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare deleting timestamptz;
begin
  if p_state not in ('started', 'other', 'refused') then
    raise exception 'plan_start_bad_state' using errcode = '22023';
  end if;
  select p.deletion_requested_at into deleting from public.parents p
    join public.card_setups c on c.parent_id = p.id where c.id = p_card for share of p;
  if not found then return false; end if;
  update public.plan_starts p set
    state = p_state, finished_at = now(), subscription_id = p_subscription, first_charge_at = p_first_charge,
    email_state = case when p_state = 'started' and p_email and deleting is null then 'pending' else 'none' end
    where p.card_setup_id = p_card and p.generation = p_generation and p.state = 'open';
  return found;
end $$;

-- Both worker phases recheck these customers. A queued request may have passed its original Stripe check before the start landed.
-- Team closure is included: its fresh whole-list read must show that nothing can charge before any data is removed.
create function public.family_deletion_start_customers(p uuid) returns table(customer text)
language sql stable security definer set search_path = '' as $$
  select distinct c.stripe_customer_id
  from public.parents f join public.plan_starts s on s.parent_id = f.id
  join public.card_setups c on c.id = s.card_setup_id and c.parent_id = f.id
  where f.id = p and f.deletion_requested_at is not null and s.state <> 'open'
    and s.finished_at >= f.deletion_requested_at and c.stripe_customer_id is not null;
$$;
revoke all on function public.family_deletion_start_customers(uuid) from public, anon, authenticated;
grant execute on function public.family_deletion_start_customers(uuid) to service_role;
