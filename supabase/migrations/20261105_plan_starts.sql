-- Plan start records (#554, review round 4 of PR #593). A plan creation's record was one set of columns on child_card_updates, and
-- it was cleared on success. So two admins who both read an empty subscription list could each get a key: A created and cleared,
-- then B got a new key and created a second plan. A record that was cleared at 24 hours could also let a press start a second plan
-- beside a creation that landed later. Stripe's key expiry does not prove that the first request ended.
--
-- Now each start is one durable row, and it is never cleared:
--   - One key per card setup and generation: the primary key and the unique key say so.
--   - admit_plan_start is the one way to a create call. It runs under the child's row lock. It opens a generation only when the
--     one before it is closed, and otherwise it answers the row that exists, so a delayed second press gets the first press's key,
--     or finds that it finished.
--   - A finished record stays. A new generation opens only when the caller read from Stripe that the record's plan has ended, or
--     when the record is one that started nothing (refused by Stripe, or closed by an admin after their own check).
--   - Time closes nothing. An open record older than 24 hours stays open, the sweep goes on looking, and the team gets one alert.
--     Only team_end_plan_start closes it, and only an admin's request calls that.
--   - email_state: the parent's confirmation email has its own state. pending stays due in the sweep. sent and unknown are final:
--     the email module's rule is that an unknown outcome is not sent again.
--
-- Additive. begin_plan_start, end_plan_start, card_update_rows and the columns pending_plan_key, pending_plan_card and
-- pending_plan_at stay for a deployment of an older head, and the code no longer uses them. A later migration can drop them. Only
-- the server writes, through these functions. Admins read. Parents and anon read nothing. A family deletion removes the rows
-- through the foreign keys, and the family write fence covers new rows and updates. No card data: only Stripe ids.
create table public.plan_starts (
  card_setup_id uuid not null references public.card_setups (id) on delete cascade,
  generation integer not null check (generation >= 1),
  parent_id uuid not null references public.parents (id) on delete cascade,
  start_key text not null unique check (char_length(start_key) between 1 and 255),
  payment_method_id text not null check (char_length(payment_method_id) between 1 and 255),
  state text not null default 'open' check (state in ('open', 'started', 'other', 'refused', 'team_ended')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  subscription_id text check (char_length(subscription_id) between 1 and 255),
  first_charge_at timestamptz,
  email_state text not null default 'none' check (email_state in ('none', 'pending', 'sent', 'unknown')),
  email_noted_at timestamptz,
  team_alert_state text check (team_alert_state in ('sending', 'sent', 'unknown')),
  team_alert_at timestamptz,
  team_alert_email_id text check (char_length(team_alert_email_id) <= 255),
  team_alert_error text check (char_length(team_alert_error) <= 500),
  ended_by uuid,
  primary key (card_setup_id, generation),
  constraint plan_starts_finish_whole check ((state = 'open') = (finished_at is null)),
  constraint plan_starts_started_has_plan check (state not in ('started', 'other') or subscription_id is not null),
  constraint plan_starts_email_only_started check (email_state = 'none' or state = 'started')
);
create index plan_starts_parent_idx on public.plan_starts (parent_id);
create index plan_starts_due_idx on public.plan_starts (card_setup_id) where state = 'open' or email_state = 'pending';

alter table public.plan_starts enable row level security;
revoke all on table public.plan_starts from anon, authenticated, service_role;
grant select on table public.plan_starts to service_role;
grant select on table public.plan_starts to authenticated;
create policy "Admins read plan starts" on public.plan_starts
  for select to authenticated using ((select public.is_admin()));

create trigger fence_family_write before insert or update on public.plan_starts
  for each row execute function public.fence_family_write();

-- A creation recorded by the earlier columns carries over as generation 1, still open.
insert into public.plan_starts (card_setup_id, generation, parent_id, start_key, payment_method_id, started_at)
  select c.id, 1, s.parent_id, s.pending_plan_key, s.pending_plan_card, s.pending_plan_at
  from public.child_card_updates s
  join public.card_setups c on c.child_id = s.child_id and c.parent_id = s.parent_id
  where s.pending_plan_key is not null
  on conflict do nothing;

-- The answer for one record.
create function public.plan_start_answer(p_row public.plan_starts, p_admitted boolean)
returns jsonb
language sql immutable security definer set search_path = '' as $$
  select jsonb_build_object(
    'admitted', p_admitted, 'generation', p_row.generation, 'key', p_row.start_key, 'card', p_row.payment_method_id,
    'at', p_row.started_at, 'state', p_row.state, 'subscription', p_row.subscription_id, 'first_charge', p_row.first_charge_at,
    'finished_at', p_row.finished_at, 'email', p_row.email_state, 'alert', p_row.team_alert_state
  );
$$;
revoke all on function public.plan_start_answer(public.plan_starts, boolean) from public, anon, authenticated, service_role;

-- The way to a create call. p_generation is the generation the caller means to send under: the open one it read, for a retry, or
-- the one after the closed one it read, for a new start. In one step under the child's row lock:
--   - The generation before p_generation is closed (or p_generation is 1 with no record): opens p_generation with p_key and
--     p_payment_method. admitted is true.
--   - Otherwise nothing changes, and the answer is the newest record, with admitted false. The caller sends only when that record
--     is open and is the generation it asked for, and then it sends that record's key and card.
-- So two presses cannot hold two keys of one generation, and a press that read before another press finished cannot open a new one.
create function public.admit_plan_start(p_card uuid, p_generation integer, p_key text, p_payment_method text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_child uuid;
  v_parent uuid;
  v_latest public.plan_starts;
begin
  if p_generation is null or p_generation < 1 then
    raise exception 'plan_start_bad_generation' using errcode = '22023';
  end if;
  select c.child_id, c.parent_id into v_child, v_parent from public.card_setups c where c.id = p_card;
  if not found then
    raise exception 'plan_start_no_card_setup' using errcode = 'P0002';
  end if;
  insert into public.child_card_updates (child_id, parent_id) values (v_child, v_parent) on conflict (child_id) do nothing;
  perform 1 from public.child_card_updates s where s.child_id = v_child for update;
  select * into v_latest from public.plan_starts p where p.card_setup_id = p_card order by p.generation desc limit 1;
  if coalesce(v_latest.generation, 0) = p_generation - 1 and coalesce(v_latest.state, 'none') <> 'open' then
    insert into public.plan_starts (card_setup_id, generation, parent_id, start_key, payment_method_id)
      values (p_card, p_generation, v_parent, p_key, p_payment_method)
      returning * into v_latest;
    return public.plan_start_answer(v_latest, true);
  end if;
  if v_latest.generation is null then
    raise exception 'plan_start_generation_gap' using errcode = '22023';
  end if;
  return public.plan_start_answer(v_latest, false);
end $$;
revoke all on function public.admit_plan_start(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.admit_plan_start(uuid, integer, text, text) to service_role;

-- An open record is decided: started (its subscription was found or answered), other (another running subscription was found, so
-- no start may run anyway) or refused (Stripe said no, so nothing started). A closed record stays as it is. Answers whether this
-- call closed it. p_email: the parent is still to hear about a started plan.
create function public.finish_plan_start(p_card uuid, p_generation integer, p_state text, p_subscription text, p_first_charge timestamptz, p_email boolean)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_state not in ('started', 'other', 'refused') then
    raise exception 'plan_start_bad_state' using errcode = '22023';
  end if;
  update public.plan_starts p set
    state = p_state, finished_at = now(), subscription_id = p_subscription, first_charge_at = p_first_charge,
    email_state = case when p_state = 'started' and p_email then 'pending' else 'none' end
    where p.card_setup_id = p_card and p.generation = p_generation and p.state = 'open';
  return found;
end $$;
revoke all on function public.finish_plan_start(uuid, integer, text, text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.finish_plan_start(uuid, integer, text, text, timestamptz, boolean) to service_role;

-- The confirmation email has a final outcome. Only pending moves. A refused or a busy send does not call this, so it stays pending.
create function public.note_plan_start_email(p_card uuid, p_generation integer, p_state text)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_state not in ('sent', 'unknown') then
    raise exception 'plan_start_bad_email_state' using errcode = '22023';
  end if;
  update public.plan_starts p set email_state = p_state, email_noted_at = now()
    where p.card_setup_id = p_card and p.generation = p_generation and p.email_state = 'pending';
  return found;
end $$;
revoke all on function public.note_plan_start_email(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.note_plan_start_email(uuid, integer, text) to service_role;

-- The send ledger of the team's one alert. A claim is possible only for an open record at least 24 hours old with no claim held.
create function public.claim_plan_start_alert(p_card uuid, p_generation integer)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.plan_starts p set team_alert_state = 'sending', team_alert_at = now(), team_alert_error = null
    where p.card_setup_id = p_card and p.generation = p_generation and p.state = 'open'
      and p.team_alert_state is null and p.started_at <= now() - interval '24 hours';
  return found;
end $$;
revoke all on function public.claim_plan_start_alert(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_plan_start_alert(uuid, integer) to service_role;

-- The alert's outcome: sent and unknown keep the claim, released gives it back for the next sweep.
create function public.note_plan_start_alert(p_card uuid, p_generation integer, p_state text, p_email_id text, p_error text)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_state not in ('sent', 'unknown', 'released') then
    raise exception 'plan_start_bad_alert_state' using errcode = '22023';
  end if;
  update public.plan_starts p set
    team_alert_state = case when p_state = 'released' then null else p_state end,
    team_alert_email_id = left(p_email_id, 255), team_alert_error = left(p_error, 500)
    where p.card_setup_id = p_card and p.generation = p_generation and p.team_alert_state = 'sending';
  return found;
end $$;
revoke all on function public.note_plan_start_alert(uuid, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.note_plan_start_alert(uuid, integer, text, text, text) to service_role;

-- An admin, after their own check in Stripe, closes an open record at least 24 hours old. The one thing that closes a record with
-- no plan found. The route checks the admin's session and reads Stripe first.
create function public.team_end_plan_start(p_card uuid, p_generation integer, p_admin uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_admin is null then
    raise exception 'plan_start_no_admin' using errcode = '22023';
  end if;
  update public.plan_starts p set state = 'team_ended', finished_at = now(), ended_by = p_admin
    where p.card_setup_id = p_card and p.generation = p_generation and p.state = 'open'
      and p.started_at <= now() - interval '24 hours';
  return found;
end $$;
revoke all on function public.team_end_plan_start(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.team_end_plan_start(uuid, integer, uuid) to service_role;

-- Rows with their customer and their newest plan start. With p_card or p_customer: that row. With neither: the sweep's rows, those
-- with an open start, a pending email, or a card that is flagged or that changed after p_changed_after, the row looked at longest
-- ago first. A family being deleted has none.
create function public.card_check_rows(
  p_card uuid default null,
  p_customer text default null,
  p_changed_after timestamptz default null,
  p_limit integer default 200
)
returns table (
  card_id uuid, customer text, session_id text, payment_method_id text, needs_repair boolean,
  start_generation integer, start_key text, start_card text, start_at timestamptz, start_state text, start_subscription text,
  start_first_charge timestamptz, start_finished_at timestamptz, start_email text, start_alert text
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.stripe_customer_id, s.session_id, s.payment_method_id, s.needs_repair,
    l.generation, l.start_key, l.payment_method_id, l.started_at, l.state, l.subscription_id,
    l.first_charge_at, l.finished_at, l.email_state, l.team_alert_state
  from public.child_card_updates s
  join public.card_setups c on c.child_id = s.child_id and c.parent_id = s.parent_id
  join public.parents p on p.id = s.parent_id
  left join lateral (
    select * from public.plan_starts x where x.card_setup_id = c.id order by x.generation desc limit 1
  ) l on true
  where c.stripe_customer_id is not null
    and p.deletion_requested_at is null
    and (
      (p_card is not null and c.id = p_card)
      or (p_customer is not null and c.stripe_customer_id = p_customer)
      or (p_card is null and p_customer is null and (
        l.state = 'open'
        or l.email_state = 'pending'
        or (s.payment_method_id is not null and (s.needs_repair or s.updated_at > p_changed_after))
      ))
    )
  order by s.reconciled_at asc nulls first, c.id
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
$$;
revoke all on function public.card_check_rows(uuid, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.card_check_rows(uuid, text, timestamptz, integer) to service_role;
