-- Plan state order (#548, review of PR #572): the row keeps the latest Stripe read. Every event reads the customer's
-- subscriptions again, so a read that started later has seen at least as much as one that started earlier, whatever
-- the events' own times are. The old order compared event times first: a newer event that read first could replace the
-- answer of a delayed older event that read later, and the row stayed wrong until the next webhook.
--
-- With no event (p_event_at null) the function only fills a missing row, as before. With an event it writes when the
-- row holds another event or a fill, and this read started later; or this read started at the same time and the row is
-- a fill or its event is not newer. An event id equal to the row's id writes nothing and answers 'duplicate'. It
-- answers 'stored' when it wrote and 'older' otherwise.
-- Additive: same signature and same answers, and no code on main calls the function. create or replace keeps the grants.
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
      where excluded.event_id is distinct from t.event_id
        and (excluded.read_at > t.read_at
          or (excluded.read_at = t.read_at and (t.event_at is null or excluded.event_at >= t.event_at)));
  end if;
  if found then
    return 'stored';
  end if;
  return case when p_event_id is not null and exists (select 1 from public.child_plan_states s where s.child_id = v_child and s.event_id = p_event_id)
    then 'duplicate' else 'older' end;
end $$;
