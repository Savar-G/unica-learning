-- Stripe follows the row (#554, review round 3 of PR #593). A client timeout leaves a Stripe request's outcome unknown, and the
-- request can land later, so a lock cannot order the writes. The row now only says what the truth is: the child's newest card.
-- The return, the webhook and the sweep each compare Stripe with the row and write what differs (src/lib/card-reconcile.ts).
--
-- pending_plan_key, pending_plan_card, pending_plan_at: a plan creation recorded before its Stripe request. The key is the
-- request's idempotency key, and a retry sends the same key with the same card. Stripe keeps a key for 24 hours, so past that the
-- sweep decides by listing the customer's subscriptions. reconciled_at: when the sweep last looked, so that a row that keeps
-- failing cannot hold up the others.
--
-- updated_at now means "the card changed". The new functions change it only when they record a card, so the sweep's 7 days end.
--
-- Additive. take_card_lock, finish_card_lock, release_card_lock, claim_card_update and finish_card_update, and the columns
-- lock_token and lock_expires_at, stay for a deployment of an older head. A later migration can drop them. Only the server writes,
-- through these functions. Admins read. Parents and anon read nothing.
alter table public.child_card_updates
  add column pending_plan_key text check (char_length(pending_plan_key) between 1 and 255),
  add column pending_plan_card text check (char_length(pending_plan_card) between 1 and 255),
  add column pending_plan_at timestamptz,
  add column reconciled_at timestamptz,
  add constraint child_card_updates_pending_whole check (
    (pending_plan_key is null) = (pending_plan_at is null) and (pending_plan_key is null) = (pending_plan_card is null)
  );

-- Records the session's card when it is the child's newest, and answers the row as jsonb:
--   no_match: not this parent's card setup; nothing written.
--   row: session, payment_method, needs_repair, recorded (true when this call made p_session the newest).
-- Stripe's times are whole seconds, so two sessions of the same second take the order of their ids.
create function public.record_card_update(
  p_parent uuid,
  p_card uuid,
  p_session text,
  p_session_created_at timestamptz,
  p_payment_method text
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_child uuid;
  v_row public.child_card_updates;
  v_recorded boolean := false;
begin
  select c.child_id into v_child from public.card_setups c where c.id = p_card and c.parent_id = p_parent;
  if not found then
    return jsonb_build_object('state', 'no_match');
  end if;
  insert into public.child_card_updates (child_id, parent_id) values (v_child, p_parent) on conflict (child_id) do nothing;
  select * into strict v_row from public.child_card_updates s where s.child_id = v_child for update;
  if v_row.session_id is null
    or p_session_created_at > v_row.session_created_at
    or (p_session_created_at = v_row.session_created_at and p_session collate "C" > v_row.session_id collate "C") then
    update public.child_card_updates s set
      session_id = p_session, session_created_at = p_session_created_at, payment_method_id = p_payment_method,
      applied_at = null, needs_repair = true, updated_at = now()
      where s.child_id = v_child returning * into v_row;
    v_recorded := true;
  elsif v_row.session_id = p_session and v_row.payment_method_id is null then
    -- A row from before migration card_update_lock: its session is known, its card only now.
    update public.child_card_updates s set
      payment_method_id = p_payment_method, needs_repair = (s.applied_at is null), updated_at = now()
      where s.child_id = v_child returning * into v_row;
  end if;
  return jsonb_build_object(
    'state', 'row', 'session', v_row.session_id, 'payment_method', v_row.payment_method_id,
    'needs_repair', v_row.needs_repair, 'recorded', v_recorded
  );
end $$;
revoke all on function public.record_card_update(uuid, uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.record_card_update(uuid, uuid, text, timestamptz, text) to service_role;

-- After a comparison of Stripe with p_session's card. Answers as jsonb:
--   newer: another session is the newest now (session, payment_method). Compare with that card. Nothing written.
--   settled: p_confirmed, and p_session still is the newest. A read showed Stripe on its card, so the flag is cleared.
--   flagged: not p_confirmed, and p_session still is the newest. The flag is set, so the sweep goes on looking after its 7 days.
-- One step under the row's lock, so a card recorded just before this answers newer, and its flag is not cleared.
create function public.settle_card_update(p_card uuid, p_session text, p_confirmed boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_child uuid;
  v_row public.child_card_updates;
begin
  select c.child_id into v_child from public.card_setups c where c.id = p_card;
  if found then
    select * into v_row from public.child_card_updates s where s.child_id = v_child for update;
  end if;
  if v_row.child_id is null then
    return jsonb_build_object('state', 'newer', 'session', null, 'payment_method', null);
  end if;
  if v_row.session_id is distinct from p_session then
    return jsonb_build_object('state', 'newer', 'session', v_row.session_id, 'payment_method', v_row.payment_method_id);
  end if;
  if p_confirmed then
    update public.child_card_updates s set
      needs_repair = false, applied_at = case when s.session_id is null then null else coalesce(s.applied_at, now()) end
      where s.child_id = v_child and (s.needs_repair or (s.session_id is not null and s.applied_at is null));
    return jsonb_build_object('state', 'settled');
  end if;
  update public.child_card_updates s set needs_repair = true
    where s.child_id = v_child and not s.needs_repair and s.payment_method_id is not null;
  return jsonb_build_object('state', 'flagged');
end $$;
revoke all on function public.settle_card_update(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.settle_card_update(uuid, text, boolean) to service_role;

-- Rows with their customer. With p_card or p_customer: that row. With neither: the sweep's rows, those with a pending plan or with
-- a card that is flagged or that changed after p_changed_after, the row looked at longest ago first. A family being deleted has none.
create function public.card_update_rows(
  p_card uuid default null,
  p_customer text default null,
  p_changed_after timestamptz default null,
  p_limit integer default 200
)
returns table (
  card_id uuid, customer text, session_id text, payment_method_id text, needs_repair boolean,
  pending_plan_key text, pending_plan_card text, pending_plan_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.stripe_customer_id, s.session_id, s.payment_method_id, s.needs_repair,
    s.pending_plan_key, s.pending_plan_card, s.pending_plan_at
  from public.child_card_updates s
  join public.card_setups c on c.child_id = s.child_id and c.parent_id = s.parent_id
  join public.parents p on p.id = s.parent_id
  where c.stripe_customer_id is not null
    and p.deletion_requested_at is null
    and (
      (p_card is not null and c.id = p_card)
      or (p_customer is not null and c.stripe_customer_id = p_customer)
      or (p_card is null and p_customer is null and (
        s.pending_plan_key is not null
        or (s.payment_method_id is not null and (s.needs_repair or s.updated_at > p_changed_after))
      ))
    )
  order by s.reconciled_at asc nulls first, c.id
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
$$;
revoke all on function public.card_update_rows(uuid, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.card_update_rows(uuid, text, timestamptz, integer) to service_role;

-- The sweep looked at this row.
create function public.note_card_checked(p_card uuid)
returns void
language sql security definer set search_path = '' as $$
  update public.child_card_updates s set reconciled_at = now()
    from public.card_setups c where c.id = p_card and s.child_id = c.child_id;
$$;
revoke all on function public.note_card_checked(uuid) from public, anon, authenticated;
grant execute on function public.note_card_checked(uuid) to service_role;

-- Records a plan creation before its Stripe request. With one pending already, it stays, and the answer is that one, so a double
-- click or a retry sends the same key with the same card. Answers key, card and at as jsonb. A plan start on a child with no card
-- update makes a row with no session and no card.
create function public.begin_plan_start(p_card uuid, p_key text, p_payment_method text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_child uuid;
  v_parent uuid;
  v_row public.child_card_updates;
begin
  select c.child_id, c.parent_id into v_child, v_parent from public.card_setups c where c.id = p_card;
  if not found then
    raise exception 'plan_start_no_card_setup' using errcode = 'P0002';
  end if;
  insert into public.child_card_updates (child_id, parent_id) values (v_child, v_parent) on conflict (child_id) do nothing;
  select * into strict v_row from public.child_card_updates s where s.child_id = v_child for update;
  if v_row.pending_plan_key is null then
    update public.child_card_updates s set pending_plan_key = p_key, pending_plan_card = p_payment_method, pending_plan_at = now()
      where s.child_id = v_child returning * into v_row;
  end if;
  return jsonb_build_object('key', v_row.pending_plan_key, 'card', v_row.pending_plan_card, 'at', v_row.pending_plan_at);
end $$;
revoke all on function public.begin_plan_start(uuid, text, text) from public, anon, authenticated;
grant execute on function public.begin_plan_start(uuid, text, text) to service_role;

-- The pending creation with this key is decided. Another key's record stays. Answers whether it ended one.
create function public.end_plan_start(p_card uuid, p_key text)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.child_card_updates s set pending_plan_key = null, pending_plan_card = null, pending_plan_at = null
    from public.card_setups c where c.id = p_card and s.child_id = c.child_id and s.pending_plan_key = p_key;
  return found;
end $$;
revoke all on function public.end_plan_start(uuid, text) from public, anon, authenticated;
grant execute on function public.end_plan_start(uuid, text) to service_role;
