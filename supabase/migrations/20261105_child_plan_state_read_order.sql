-- Plan state order from the database (#548, review of PR #572). The row keeps the read with the highest value from one
-- shared sequence. The old order compared read_at, a time from the clock of each application server: a server with a
-- slower clock could store an older time for a later read, the function refused that read, the webhook answered 204 and
-- Stripe did not send the event again.
--
-- The site takes a value (take_plan_read_order) before each Stripe read. So when a read misses a change, its take came
-- before that change, and the take of the change's own event comes after it. The highest take in the row always saw
-- every change whose event has taken a value. Values never repeat, so there are no ties. A value lost to a failure or a
-- rollback leaves a gap, and a gap changes nothing. The sequence has cache 1, so every session gets the next value in
-- the order of the calls.
--
-- save_child_plan_state with p_read_order: with no event (p_event_at null) it only fills a missing row. With an event it
-- writes when the row holds another event or a fill, and this take is larger or the row has no take. An event id equal
-- to the row's id writes nothing and answers 'duplicate'. It answers 'stored' when it wrote and 'older' otherwise. It
-- writes read_at from the database's clock; no rule reads read_at now.
--
-- Additive: the signature with p_read_at stays, so a deployment of the earlier code in this pull request keeps working.
-- Its rows have no read_order, and it never replaces a row that has one. Drop it and read_at after the code ships.
create sequence public.child_plan_state_read_order as bigint cache 1 no cycle;
revoke all on sequence public.child_plan_state_read_order from public, anon, authenticated, service_role;

alter table public.child_plan_states add column read_order bigint;

create function public.take_plan_read_order()
returns bigint
language sql security definer set search_path = '' as $$
  select nextval('public.child_plan_state_read_order'::regclass);
$$;
revoke all on function public.take_plan_read_order() from public, anon, authenticated;
grant execute on function public.take_plan_read_order() to service_role;

create function public.save_child_plan_state(p_customer text, p_kind text, p_next_charge_at timestamptz, p_ends_at timestamptz,
  p_monthly_cents integer, p_ending_free boolean, p_event_at timestamptz, p_event_id text, p_read_order bigint)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_parent uuid;
  v_child uuid;
begin
  if p_read_order is null then
    raise exception 'read order required' using errcode = '22004';
  end if;
  select c.parent_id, c.child_id into v_parent, v_child from public.card_setups c where c.stripe_customer_id = p_customer;
  if not found then
    return 'no_match';
  end if;
  if p_event_at is null then
    insert into public.child_plan_states (child_id, parent_id, kind, next_charge_at, ends_at, monthly_cents, ending_free, event_at, event_id, read_at, read_order)
      values (v_child, v_parent, p_kind, p_next_charge_at, p_ends_at, p_monthly_cents, p_ending_free, null, p_event_id, now(), p_read_order)
      on conflict (child_id) do nothing;
  else
    insert into public.child_plan_states as t (child_id, parent_id, kind, next_charge_at, ends_at, monthly_cents, ending_free, event_at, event_id, read_at, read_order)
      values (v_child, v_parent, p_kind, p_next_charge_at, p_ends_at, p_monthly_cents, p_ending_free, p_event_at, p_event_id, now(), p_read_order)
      on conflict (child_id) do update set
        kind = excluded.kind, next_charge_at = excluded.next_charge_at, ends_at = excluded.ends_at, monthly_cents = excluded.monthly_cents,
        ending_free = excluded.ending_free, event_at = excluded.event_at, event_id = excluded.event_id, read_at = excluded.read_at,
        read_order = excluded.read_order, updated_at = now()
      where excluded.event_id is distinct from t.event_id
        and (t.read_order is null or excluded.read_order > t.read_order);
  end if;
  if found then
    return 'stored';
  end if;
  return case when p_event_id is not null and exists (select 1 from public.child_plan_states s where s.child_id = v_child and s.event_id = p_event_id)
    then 'duplicate' else 'older' end;
end $$;
revoke all on function public.save_child_plan_state(text, text, timestamptz, timestamptz, integer, boolean, timestamptz, text, bigint) from public, anon, authenticated;
grant execute on function public.save_child_plan_state(text, text, timestamptz, timestamptz, integer, boolean, timestamptz, text, bigint) to service_role;

-- The signature with p_read_at: as before, and it never replaces a row that has a read_order. create or replace keeps
-- its grants.
create or replace function public.save_child_plan_state(p_customer text, p_kind text, p_next_charge_at timestamptz, p_ends_at timestamptz,
  p_monthly_cents integer, p_ending_free boolean, p_event_at timestamptz, p_event_id text, p_read_at timestamptz)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_parent uuid;
  v_child uuid;
begin
  select c.parent_id, c.child_id into v_parent, v_child from public.card_setups c where c.stripe_customer_id = p_customer;
  if not found then
    return 'no_match';
  end if;
  if p_event_at is null then
    insert into public.child_plan_states (child_id, parent_id, kind, next_charge_at, ends_at, monthly_cents, ending_free, event_at, event_id, read_at)
      values (v_child, v_parent, p_kind, p_next_charge_at, p_ends_at, p_monthly_cents, p_ending_free, null, p_event_id, p_read_at)
      on conflict (child_id) do nothing;
  else
    insert into public.child_plan_states as t (child_id, parent_id, kind, next_charge_at, ends_at, monthly_cents, ending_free, event_at, event_id, read_at)
      values (v_child, v_parent, p_kind, p_next_charge_at, p_ends_at, p_monthly_cents, p_ending_free, p_event_at, p_event_id, p_read_at)
      on conflict (child_id) do update set
        kind = excluded.kind, next_charge_at = excluded.next_charge_at, ends_at = excluded.ends_at, monthly_cents = excluded.monthly_cents,
        ending_free = excluded.ending_free, event_at = excluded.event_at, event_id = excluded.event_id, read_at = excluded.read_at, updated_at = now()
      where t.read_order is null
        and excluded.event_id is distinct from t.event_id
        and (excluded.read_at > t.read_at
          or (excluded.read_at = t.read_at and (t.event_at is null or excluded.event_at >= t.event_at)));
  end if;
  if found then
    return 'stored';
  end if;
  return case when p_event_id is not null and exists (select 1 from public.child_plan_states s where s.child_id = v_child and s.event_id = p_event_id)
    then 'duplicate' else 'older' end;
end $$;
