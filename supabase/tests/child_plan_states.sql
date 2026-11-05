-- Hosted probe for public.child_plan_states (#548). All rows are synthetic. The final exception rolls everything back,
-- so a run that reaches the end reports PROBE_OK and leaves nothing. Run it with the Management API; see
-- docs/stripe-webhook.md. No provider calls.
do $$
declare
  p uuid := gen_random_uuid(); other uuid := gen_random_uuid(); child_a uuid := gen_random_uuid(); child_b uuid := gen_random_uuid(); child_other uuid := gen_random_uuid();
  customer text := 'cus_probe_' || replace(p::text, '-', ''); customer_b text := 'cus_probe_b_' || replace(p::text, '-', ''); n integer; r text; s public.child_plan_states;
  t0 timestamptz := '2026-11-01 00:00:00+00';
begin
  insert into auth.users(id, email) values (p, p::text || '@example.invalid'), (other, other::text || '@example.invalid');
  insert into public.parents(id, name, email, postal) values
    (p, 'Probe parent', p::text || '@example.invalid', 'V6B 1A1'), (other, 'Probe other', other::text || '@example.invalid', 'V6B 1A1');
  insert into public.children(id, parent_id, first_name, grade, province) values
    (child_a, p, 'Probe A', 3, 'BC'), (child_b, p, 'Probe C', 3, 'BC'), (child_other, other, 'Probe B', 3, 'BC');
  insert into public.card_setups(parent_id, child_id, plan, price, stripe_customer_id, workbook_welcome_enabled)
    values (p, child_a, 'one', 79.99, customer, false), (p, child_b, 'one', 79.99, customer_b, false);

  set local role service_role;

  -- A customer with no card setup writes nothing.
  r := public.save_child_plan_state('cus_probe_none', 'paying', null, null, 7999, false, t0, 'evt_x', t0);
  if r <> 'no_match' then raise exception 'no match answered %', r; end if;

  -- A fill makes the row, a second fill keeps it.
  r := public.save_child_plan_state(customer, 'not_started', null, null, null, false, null, null, t0);
  if r <> 'stored' then raise exception 'fill answered %', r; end if;
  r := public.save_child_plan_state(customer, 'ended', null, null, null, false, null, null, t0 + interval '1 hour');
  if r <> 'older' then raise exception 'second fill answered %', r; end if;
  select * into s from public.child_plan_states where child_id = child_a;
  if s.kind <> 'not_started' or s.parent_id <> p then raise exception 'second fill replaced the row'; end if;

  -- Any event replaces a filled row, even one older than the fill.
  r := public.save_child_plan_state(customer, 'free_month', t0 + interval '30 days', null, 7999, false, t0 - interval '1 day', 'evt_a', t0);
  if r <> 'stored' then raise exception 'event over fill answered %', r; end if;

  -- A fill never replaces an event's row.
  r := public.save_child_plan_state(customer, 'not_started', null, null, null, false, null, null, t0 + interval '2 hours');
  select * into s from public.child_plan_states where child_id = child_a;
  if r <> 'older' or s.kind <> 'free_month' or s.event_id <> 'evt_a' then raise exception 'fill over event answered %', r; end if;

  -- A later read replaces. A duplicate of the row's event does not, even with a later read.
  r := public.save_child_plan_state(customer, 'paying', t0 + interval '60 days', null, 7999, false, t0, 'evt_b', t0 + interval '1 second');
  if r <> 'stored' then raise exception 'later read answered %', r; end if;
  r := public.save_child_plan_state(customer, 'ended', null, t0, null, false, t0, 'evt_b', t0 + interval '9 hours');
  if r <> 'duplicate' then raise exception 'duplicate answered %', r; end if;
  select * into s from public.child_plan_states where child_id = child_a;
  if s.kind <> 'paying' or s.event_id <> 'evt_b' or s.monthly_cents <> 7999 or s.read_at <> t0 + interval '1 second' then raise exception 'duplicate replaced the row: %', s.kind; end if;

  -- The race: a newer event reads free_month and waits. A delayed older event reads the current payment_failed and
  -- saves it. The newer event's save then changes nothing, because its read started first.
  r := public.save_child_plan_state(customer, 'payment_failed', null, null, null, false, t0 - interval '1 hour', 'evt_late_old', t0 + interval '3 seconds');
  if r <> 'stored' then raise exception 'older event with the later read answered %', r; end if;
  r := public.save_child_plan_state(customer, 'free_month', t0 + interval '30 days', null, 7999, false, t0 + interval '1 hour', 'evt_early_new', t0 + interval '2 seconds');
  if r <> 'older' then raise exception 'newer event with the earlier read answered %', r; end if;
  select * into s from public.child_plan_states where child_id = child_a;
  if s.kind <> 'payment_failed' or s.event_id <> 'evt_late_old' or s.read_at <> t0 + interval '3 seconds' then raise exception 'an earlier read replaced a later read: %', s.kind; end if;

  -- Two reads that start at the same time: the event time decides.
  r := public.save_child_plan_state(customer, 'paying', t0 + interval '60 days', null, 7999, false, t0 - interval '30 minutes', 'evt_tie_new', t0 + interval '3 seconds');
  if r <> 'stored' then raise exception 'tie with the newer event answered %', r; end if;
  r := public.save_child_plan_state(customer, 'ended', null, t0, null, false, t0 - interval '2 hours', 'evt_tie_old', t0 + interval '3 seconds');
  if r <> 'older' then raise exception 'tie with the older event answered %', r; end if;
  select * into s from public.child_plan_states where child_id = child_a;
  if s.kind <> 'paying' or s.event_id <> 'evt_tie_new' then raise exception 'tie with the older event replaced the row: %', s.kind; end if;

  -- Same second, another event: the later read replaces, the earlier read does not.
  r := public.save_child_plan_state(customer, 'payment_failed', null, null, null, false, t0, 'evt_c', t0 + interval '5 seconds');
  if r <> 'stored' then raise exception 'same second later read answered %', r; end if;
  r := public.save_child_plan_state(customer, 'paying', null, null, 7999, false, t0, 'evt_d', t0 + interval '4 seconds');
  if r <> 'older' then raise exception 'same second earlier read answered %', r; end if;
  select * into s from public.child_plan_states where child_id = child_a;
  if s.kind <> 'payment_failed' or s.ending_free or s.next_charge_at is not null then raise exception 'same second earlier read replaced the row'; end if;

  -- An event whose read started before a fill's read does not replace the filled row.
  r := public.save_child_plan_state(customer_b, 'payment_failed', null, null, null, false, null, null, t0);
  if r <> 'stored' then raise exception 'second child fill answered %', r; end if;
  r := public.save_child_plan_state(customer_b, 'free_month', t0 + interval '30 days', null, 7999, false, t0 + interval '1 hour', 'evt_before_fill', t0 - interval '1 minute');
  if r <> 'older' then raise exception 'event read before the fill answered %', r; end if;
  select * into s from public.child_plan_states where child_id = child_b;
  if s.kind <> 'payment_failed' or s.event_id is not null then raise exception 'an event with an earlier read replaced a fill: %', s.kind; end if;

  -- The checks refuse a kind that is not stored, a free month with no first charge, and an event with no id.
  begin
    perform public.save_child_plan_state(customer, 'unknown', null, null, null, false, t0 + interval '1 day', 'evt_u', t0);
    raise exception 'stored unknown';
  exception when check_violation then null;
  end;
  begin
    perform public.save_child_plan_state(customer, 'free_month', null, null, null, false, t0 + interval '1 day', 'evt_f', t0);
    raise exception 'stored a free month with no first charge';
  exception when check_violation then null;
  end;
  begin
    perform public.save_child_plan_state(customer, 'paying', null, null, null, false, t0 + interval '1 day', null, t0);
    raise exception 'stored an event with no id';
  exception when check_violation then null;
  end;

  -- The service role writes only through the function, and reads.
  select count(*) into n from public.child_plan_states where child_id = child_a;
  if n <> 1 then raise exception 'service role read % rows', n; end if;
  begin
    update public.child_plan_states set kind = 'ended' where child_id = child_a;
    raise exception 'service role updated directly';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.child_plan_states where child_id = child_a;
    raise exception 'service role deleted directly';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- The owner, another parent and anon read nothing, and none of them call the function.
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.child_plan_states;
  if n <> 0 then raise exception 'the owner read % rows', n; end if;
  begin
    perform public.save_child_plan_state(customer, 'ended', null, null, null, false, t0 + interval '1 day', 'evt_p', t0);
    raise exception 'a parent called the function';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.child_plan_states;
  if n <> 0 then raise exception 'another parent read % rows', n; end if;
  reset role;
  set local role anon;
  begin
    perform count(*) from public.child_plan_states;
    raise exception 'anon read the table';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_child_plan_state(customer, 'ended', null, null, null, false, t0 + interval '1 day', 'evt_a2', t0);
    raise exception 'anon called the function';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- The family write fence refuses a write once a deletion is requested, and the deletion removes the row.
  update public.parents set deletion_requested_at = now() where id = p;
  set local role service_role;
  begin
    perform public.save_child_plan_state(customer, 'ended', null, null, null, false, t0 + interval '1 day', 'evt_fence', t0);
    raise exception 'the fence let a write through';
  exception when sqlstate '55000' then null;
  end;
  reset role;
  delete from public.parents where id = p;
  select count(*) into n from public.child_plan_states where parent_id = p or child_id in (child_a, child_b);
  if n <> 0 then raise exception 'deleting the family left % rows', n; end if;

  raise exception 'PROBE_OK';
end $$;
