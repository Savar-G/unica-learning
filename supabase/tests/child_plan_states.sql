-- Hosted probe for public.child_plan_states (#548). All rows are synthetic. The final exception rolls everything back,
-- so a run that reaches the end reports PROBE_OK and leaves nothing, except the sequence values it took: a rollback does
-- not return them, and a gap changes nothing. Run it with the Management API; see docs/stripe-webhook.md. No provider calls.
do $$
declare
  p uuid := gen_random_uuid(); other uuid := gen_random_uuid(); child_a uuid := gen_random_uuid(); child_b uuid := gen_random_uuid(); child_c uuid := gen_random_uuid(); child_other uuid := gen_random_uuid();
  customer text := 'cus_probe_' || replace(p::text, '-', ''); customer_b text := 'cus_probe_b_' || replace(p::text, '-', ''); customer_c text := 'cus_probe_c_' || replace(p::text, '-', '');
  n integer; r text; s public.child_plan_states; o1 bigint; o2 bigint;
  t0 timestamptz := '2026-11-01 00:00:00+00';
begin
  insert into auth.users(id, email) values (p, p::text || '@example.invalid'), (other, other::text || '@example.invalid');
  insert into public.parents(id, name, email, postal) values
    (p, 'Probe parent', p::text || '@example.invalid', 'V6B 1A1'), (other, 'Probe other', other::text || '@example.invalid', 'V6B 1A1');
  insert into public.children(id, parent_id, first_name, grade, province) values
    (child_a, p, 'Probe A', 3, 'BC'), (child_b, p, 'Probe C', 3, 'BC'), (child_c, p, 'Probe D', 3, 'BC'), (child_other, other, 'Probe B', 3, 'BC');
  insert into public.card_setups(parent_id, child_id, plan, price, stripe_customer_id, workbook_welcome_enabled)
    values (p, child_a, 'one', 79.99, customer, false), (p, child_b, 'one', 79.99, customer_b, false), (p, child_c, 'one', 79.99, customer_c, false);

  set local role service_role;

  -- Each take is larger than the one before.
  o1 := public.take_plan_read_order();
  o2 := public.take_plan_read_order();
  if o2 <= o1 then raise exception 'take % after take %', o2, o1; end if;

  -- A customer with no card setup writes nothing.
  r := public.save_child_plan_state('cus_probe_none', 'paying', null, null, 7999, false, t0, 'evt_x', public.take_plan_read_order());
  if r <> 'no_match' then raise exception 'no match answered %', r; end if;

  -- A fill makes the row, a second fill keeps it.
  r := public.save_child_plan_state(customer, 'not_started', null, null, null, false, null, null, public.take_plan_read_order());
  if r <> 'stored' then raise exception 'fill answered %', r; end if;
  r := public.save_child_plan_state(customer, 'ended', null, null, null, false, null, null, public.take_plan_read_order());
  if r <> 'older' then raise exception 'second fill answered %', r; end if;
  select * into s from public.child_plan_states where child_id = child_a;
  if s.kind <> 'not_started' or s.parent_id <> p then raise exception 'second fill replaced the row'; end if;

  -- Any event with a later take replaces a filled row, even one older than the fill.
  r := public.save_child_plan_state(customer, 'free_month', t0 + interval '30 days', null, 7999, false, t0 - interval '1 day', 'evt_a', public.take_plan_read_order());
  if r <> 'stored' then raise exception 'event over fill answered %', r; end if;

  -- A fill never replaces an event's row.
  r := public.save_child_plan_state(customer, 'not_started', null, null, null, false, null, null, public.take_plan_read_order());
  select * into s from public.child_plan_states where child_id = child_a;
  if r <> 'older' or s.kind <> 'free_month' or s.event_id <> 'evt_a' then raise exception 'fill over event answered %', r; end if;

  -- The clock case. Server A takes, reads and stores paying. A later payment-failure event reaches server B, whose clock
  -- is slower. The order comes from the sequence and no app clock goes in, so B's later take replaces A's row.
  o1 := public.take_plan_read_order();
  o2 := public.take_plan_read_order();
  r := public.save_child_plan_state(customer, 'paying', t0 + interval '60 days', null, 7999, false, t0, 'evt_b', o1);
  if r <> 'stored' then raise exception 'server A answered %', r; end if;
  r := public.save_child_plan_state(customer, 'payment_failed', null, null, null, false, t0, 'evt_c', o2);
  if r <> 'stored' then raise exception 'server B with the later take answered %', r; end if;
  select * into s from public.child_plan_states where child_id = child_a;
  if s.kind <> 'payment_failed' or s.event_id <> 'evt_c' or s.read_order <> o2 then raise exception 'the later take did not replace the row: %', s.kind; end if;

  -- A duplicate of the row's event does not replace it, even with a later take.
  r := public.save_child_plan_state(customer, 'ended', null, t0, null, false, t0, 'evt_c', public.take_plan_read_order());
  if r <> 'duplicate' then raise exception 'duplicate answered %', r; end if;
  select * into s from public.child_plan_states where child_id = child_a;
  if s.kind <> 'payment_failed' or s.read_order <> o2 then raise exception 'duplicate replaced the row: %', s.kind; end if;

  -- The race: a newer event takes first, reads free_month and waits. A delayed older event takes later, reads the
  -- current payment_failed and saves it. The newer event's save then changes nothing, whatever the event times are.
  o1 := public.take_plan_read_order();
  o2 := public.take_plan_read_order();
  r := public.save_child_plan_state(customer, 'payment_failed', null, null, null, false, t0 - interval '1 hour', 'evt_late_old', o2);
  if r <> 'stored' then raise exception 'older event with the later take answered %', r; end if;
  r := public.save_child_plan_state(customer, 'free_month', t0 + interval '30 days', null, 7999, false, t0 + interval '1 hour', 'evt_early_new', o1);
  if r <> 'older' then raise exception 'newer event with the earlier take answered %', r; end if;
  select * into s from public.child_plan_states where child_id = child_a;
  if s.kind <> 'payment_failed' or s.event_id <> 'evt_late_old' or s.read_order <> o2 then raise exception 'an earlier take replaced a later take: %', s.kind; end if;

  -- An event that took before a fill took does not replace the filled row.
  o1 := public.take_plan_read_order();
  r := public.save_child_plan_state(customer_b, 'payment_failed', null, null, null, false, null, null, public.take_plan_read_order());
  if r <> 'stored' then raise exception 'second child fill answered %', r; end if;
  r := public.save_child_plan_state(customer_b, 'free_month', t0 + interval '30 days', null, 7999, false, t0 + interval '1 hour', 'evt_before_fill', o1);
  if r <> 'older' then raise exception 'event that took before the fill answered %', r; end if;
  select * into s from public.child_plan_states where child_id = child_b;
  if s.kind <> 'payment_failed' or s.event_id is not null then raise exception 'an event with an earlier take replaced a fill: %', s.kind; end if;

  -- The signature with p_read_at until the code ships: its row has no take, any take replaces that row, and after that
  -- it changes nothing. Its order among rows with no take stays as it was.
  r := public.save_child_plan_state(customer_c, 'paying', null, null, 7999, false, t0, 'evt_old_code', t0 + interval '9 hours');
  if r <> 'stored' then raise exception 'old signature answered %', r; end if;
  select * into s from public.child_plan_states where child_id = child_c;
  if s.read_order is not null or s.read_at <> t0 + interval '9 hours' then raise exception 'old signature wrote a take'; end if;
  r := public.save_child_plan_state(customer_c, 'ended', null, null, null, false, t0, 'evt_old_code_earlier', t0 + interval '8 hours');
  if r <> 'older' then raise exception 'old signature with an earlier read answered %', r; end if;
  o1 := public.take_plan_read_order();
  r := public.save_child_plan_state(customer_c, 'payment_failed', null, null, null, false, t0, 'evt_new_code', o1);
  if r <> 'stored' then raise exception 'a take over a row with no take answered %', r; end if;
  r := public.save_child_plan_state(customer_c, 'ended', null, null, null, false, t0 + interval '1 day', 'evt_old_code_2', t0 + interval '30 days');
  if r <> 'older' then raise exception 'old signature over a take answered %', r; end if;
  r := public.save_child_plan_state(customer_c, 'ended', null, null, null, false, t0, 'evt_new_code', t0 + interval '30 days');
  if r <> 'duplicate' then raise exception 'old signature duplicate answered %', r; end if;
  select * into s from public.child_plan_states where child_id = child_c;
  if s.kind <> 'payment_failed' or s.read_order <> o1 then raise exception 'old signature replaced a row with a take: %', s.kind; end if;

  -- The checks refuse no take, a kind that is not stored, a free month with no first charge, and an event with no id.
  begin
    perform public.save_child_plan_state(customer, 'paying', null, null, null, false, t0 + interval '1 day', 'evt_n', null::bigint);
    raise exception 'stored with no take';
  exception when sqlstate '22004' then null;
  end;
  begin
    perform public.save_child_plan_state(customer, 'unknown', null, null, null, false, t0 + interval '1 day', 'evt_u', public.take_plan_read_order());
    raise exception 'stored unknown';
  exception when check_violation then null;
  end;
  begin
    perform public.save_child_plan_state(customer, 'free_month', null, null, null, false, t0 + interval '1 day', 'evt_f', public.take_plan_read_order());
    raise exception 'stored a free month with no first charge';
  exception when check_violation then null;
  end;
  begin
    perform public.save_child_plan_state(customer, 'paying', null, null, null, false, t0 + interval '1 day', null, public.take_plan_read_order());
    raise exception 'stored an event with no id';
  exception when check_violation then null;
  end;

  -- The service role writes only through the function, reads, and takes only through the function.
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
  begin
    perform nextval('public.child_plan_state_read_order'::regclass);
    raise exception 'service role used the sequence directly';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- The owner, another parent and anon read nothing, and none of them call a function.
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.child_plan_states;
  if n <> 0 then raise exception 'the owner read % rows', n; end if;
  begin
    perform public.save_child_plan_state(customer, 'ended', null, null, null, false, t0 + interval '1 day', 'evt_p', 999999999999::bigint);
    raise exception 'a parent called the function';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_child_plan_state(customer, 'ended', null, null, null, false, t0 + interval '1 day', 'evt_p', t0);
    raise exception 'a parent called the old signature';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.take_plan_read_order();
    raise exception 'a parent took a read order';
  exception when insufficient_privilege then null;
  end;
  begin
    perform nextval('public.child_plan_state_read_order'::regclass);
    raise exception 'a parent used the sequence';
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
    perform public.save_child_plan_state(customer, 'ended', null, null, null, false, t0 + interval '1 day', 'evt_a2', 999999999999::bigint);
    raise exception 'anon called the function';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_child_plan_state(customer, 'ended', null, null, null, false, t0 + interval '1 day', 'evt_a2', t0);
    raise exception 'anon called the old signature';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.take_plan_read_order();
    raise exception 'anon took a read order';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- The family write fence refuses a write once a deletion is requested, and the deletion removes the row.
  update public.parents set deletion_requested_at = now() where id = p;
  set local role service_role;
  begin
    perform public.save_child_plan_state(customer, 'ended', null, null, null, false, t0 + interval '1 day', 'evt_fence', public.take_plan_read_order());
    raise exception 'the fence let a write through';
  exception when sqlstate '55000' then null;
  end;
  reset role;
  delete from public.parents where id = p;
  select count(*) into n from public.child_plan_states where parent_id = p or child_id in (child_a, child_b, child_c);
  if n <> 0 then raise exception 'deleting the family left % rows', n; end if;

  raise exception 'PROBE_OK';
end $$;
