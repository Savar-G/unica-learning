-- Hosted probe for the functions of migration card_row_reconcile (#554). All rows are synthetic. The final exception rolls
-- everything back, so a run that reaches the end reports PROBE_OK and leaves nothing. Run it with the Supabase MCP `execute_sql`;
-- see docs/parent-dashboard.md. No provider calls.
do $$
declare
  p uuid := gen_random_uuid(); other uuid := gen_random_uuid(); child uuid := gen_random_uuid(); child_other uuid := gen_random_uuid();
  card uuid; card_other uuid; customer text := 'cus_probe_' || replace(p::text, '-', '');
  n integer; b boolean; j jsonb; s public.child_card_updates; changed timestamptz; r record;
  t0 timestamptz := '2026-11-01 00:00:00+00';
begin
  insert into auth.users(id, email) values (p, p::text || '@example.invalid'), (other, other::text || '@example.invalid');
  insert into public.parents(id, name, email, postal) values
    (p, 'Probe parent', p::text || '@example.invalid', 'V6B 1A1'), (other, 'Probe other', other::text || '@example.invalid', 'V6B 1A1');
  insert into public.children(id, parent_id, first_name, grade, province) values (child, p, 'Probe A', 3, 'BC'), (child_other, other, 'Probe B', 3, 'BC');
  insert into public.card_setups(parent_id, child_id, plan, price, stripe_customer_id, workbook_welcome_enabled)
    values (p, child, 'one', 79.99, customer, false) returning id into card;
  insert into public.card_setups(parent_id, child_id, plan, price, stripe_customer_id, workbook_welcome_enabled)
    values (other, child_other, 'one', 79.99, 'cus_probe_' || replace(other::text, '-', ''), false) returning id into card_other;

  set local role service_role;

  -- A child with no row reads as none.
  select count(*) into n from public.card_update_rows(p_card => card);
  if n <> 0 then raise exception 'a child with no row read % rows', n; end if;

  -- Another family's card setup writes nothing.
  j := public.record_card_update(p, card_other, 'cs_x', t0, 'pm_x');
  if j->>'state' <> 'no_match' then raise exception 'another family answered %', j; end if;
  select count(*) into n from public.child_card_updates where child_id in (child, child_other);
  if n <> 0 then raise exception 'another family left % rows', n; end if;

  -- The first card takes the row and is flagged.
  j := public.record_card_update(p, card, 'cs_a', t0, 'pm_a');
  if j->>'state' <> 'row' or j->>'session' <> 'cs_a' or j->>'payment_method' <> 'pm_a' or not (j->>'needs_repair')::boolean or not (j->>'recorded')::boolean then raise exception 'first card answered %', j; end if;

  -- The same session records nothing. An older one records nothing and reads the newest.
  j := public.record_card_update(p, card, 'cs_a', t0, 'pm_a');
  if (j->>'recorded')::boolean or not (j->>'needs_repair')::boolean then raise exception 'same session answered %', j; end if;
  j := public.record_card_update(p, card, 'cs_0', t0 - interval '1 day', 'pm_0');
  if (j->>'recorded')::boolean or j->>'session' <> 'cs_a' or j->>'payment_method' <> 'pm_a' then raise exception 'older session answered %', j; end if;

  -- A newer card moves the row. The older session is told, and cannot clear the flag.
  j := public.record_card_update(p, card, 'cs_b', t0 + interval '1 minute', 'pm_b');
  if not (j->>'recorded')::boolean or j->>'payment_method' <> 'pm_b' then raise exception 'newer session answered %', j; end if;
  j := public.settle_card_update(card, 'cs_a', true);
  if j->>'state' <> 'newer' or j->>'session' <> 'cs_b' or j->>'payment_method' <> 'pm_b' then raise exception 'older settle answered %', j; end if;
  select * into s from public.child_card_updates where child_id = child;
  if not s.needs_repair or s.applied_at is not null then raise exception 'an older settle changed the row'; end if;

  -- Two sessions of the same second take the order of their ids.
  j := public.record_card_update(p, card, 'cs_A', t0 + interval '1 minute', 'pm_lower');
  if (j->>'recorded')::boolean then raise exception 'a lower id of the same second was recorded'; end if;

  -- A read that did not confirm keeps the flag. A read that did clears it, and sets applied_at.
  j := public.settle_card_update(card, 'cs_b', false);
  if j->>'state' <> 'flagged' then raise exception 'unconfirmed settle answered %', j; end if;
  j := public.settle_card_update(card, 'cs_b', true);
  if j->>'state' <> 'settled' then raise exception 'confirmed settle answered %', j; end if;
  select * into s from public.child_card_updates where child_id = child;
  if s.needs_repair or s.applied_at is null then raise exception 'settle did not clear the row'; end if;
  changed := s.updated_at;

  -- A later read that finds Stripe off sets the flag again.
  j := public.settle_card_update(card, 'cs_b', false);
  select * into s from public.child_card_updates where child_id = child;
  if j->>'state' <> 'flagged' or not s.needs_repair then raise exception 'a flag was not set: %', j; end if;
  perform public.settle_card_update(card, 'cs_b', true);

  -- The sweep's choice. The row changed just now, so it is due, and a look does not change updated_at.
  select count(*) into n from public.card_update_rows(p_changed_after => now() - interval '7 days') x where x.card_id = card;
  if n <> 1 then raise exception 'a row that changed in the 7 days read % rows', n; end if;
  perform public.note_card_checked(card);
  select * into s from public.child_card_updates where child_id = child;
  if s.reconciled_at is null or s.updated_at <> changed then raise exception 'a look changed updated_at'; end if;
  select count(*) into n from public.card_update_rows(p_changed_after => now() + interval '1 day') x where x.card_id = card;
  if n <> 0 then raise exception 'a clean row past its 7 days read % rows', n; end if;
  perform public.settle_card_update(card, 'cs_b', false);
  select count(*) into n from public.card_update_rows(p_changed_after => now() + interval '1 day') x where x.card_id = card;
  if n <> 1 then raise exception 'a flagged row past its 7 days read % rows', n; end if;
  perform public.settle_card_update(card, 'cs_b', true);

  -- The webhook's read by customer gives the row and its card setup.
  select * into r from public.card_update_rows(p_customer => customer);
  if r.card_id <> card or r.payment_method_id <> 'pm_b' or r.session_id <> 'cs_b' then raise exception 'the read by customer answered %', r; end if;

  -- A plan start on a child with no row makes a row with no card.
  j := public.begin_plan_start(card_other, 'key-1', 'pm_first');
  if j->>'key' <> 'key-1' or j->>'card' <> 'pm_first' or j->>'at' is null then raise exception 'first begin answered %', j; end if;
  select * into s from public.child_card_updates where child_id = child_other;
  if s.session_id is not null or s.payment_method_id is not null or s.needs_repair or s.pending_plan_key <> 'key-1' then raise exception 'the begin did not make the row'; end if;

  -- A second click gets the first record: the same key and the same card.
  j := public.begin_plan_start(card_other, 'key-2', 'pm_second');
  if j->>'key' <> 'key-1' or j->>'card' <> 'pm_first' then raise exception 'second begin answered %', j; end if;

  -- A pending plan makes a row due with no card.
  select count(*) into n from public.card_update_rows(p_changed_after => now() + interval '1 day') x where x.card_id = card_other;
  if n <> 1 then raise exception 'a pending plan read % rows', n; end if;

  -- Another key ends nothing. Its own key ends it, once.
  b := public.end_plan_start(card_other, 'key-2');
  if b then raise exception 'another key ended the record'; end if;
  b := public.end_plan_start(card_other, 'key-1');
  if not b then raise exception 'its own key did not end the record'; end if;
  b := public.end_plan_start(card_other, 'key-1');
  if b then raise exception 'its own key ended it twice'; end if;
  select * into s from public.child_card_updates where child_id = child_other;
  if s.pending_plan_key is not null or s.pending_plan_card is not null or s.pending_plan_at is not null then raise exception 'the end left a record'; end if;
  select count(*) into n from public.card_update_rows(p_changed_after => now() + interval '1 day') x where x.card_id = card_other;
  if n <> 0 then raise exception 'a row with nothing pending read % rows', n; end if;

  -- A begin for a card setup that does not exist makes nothing.
  begin
    j := public.begin_plan_start(gen_random_uuid(), 'key-3', 'pm_x');
    raise exception 'a begin worked with no card setup';
  exception when sqlstate 'P0002' then null;
  end;

  -- The service role has no direct write.
  begin
    update public.child_card_updates set pending_plan_key = 'direct', pending_plan_card = 'pm', pending_plan_at = now();
    raise exception 'the service role updated directly';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- The owner and anon read nothing and call nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.child_card_updates;
  if n <> 0 then raise exception 'the owner read % rows', n; end if;
  begin
    perform public.record_card_update(p, card, 'cs_parent', t0 + interval '1 day', 'pm_parent');
    raise exception 'a parent called record_card_update';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.settle_card_update(card, 'cs_b', true);
    raise exception 'a parent called settle_card_update';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.card_update_rows(p_card => card);
    raise exception 'a parent called card_update_rows';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.note_card_checked(card);
    raise exception 'a parent called note_card_checked';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.begin_plan_start(card, 'key-parent', 'pm_parent');
    raise exception 'a parent called begin_plan_start';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.end_plan_start(card, 'key-parent');
    raise exception 'a parent called end_plan_start';
  exception when insufficient_privilege then null;
  end;
  reset role;
  set local role anon;
  begin
    perform public.record_card_update(p, card, 'cs_anon', t0 + interval '1 day', 'pm_anon');
    raise exception 'anon called record_card_update';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.settle_card_update(card, 'cs_b', true);
    raise exception 'anon called settle_card_update';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.card_update_rows(p_card => card);
    raise exception 'anon called card_update_rows';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.note_card_checked(card);
    raise exception 'anon called note_card_checked';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.begin_plan_start(card, 'key-anon', 'pm_anon');
    raise exception 'anon called begin_plan_start';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.end_plan_start(card, 'key-anon');
    raise exception 'anon called end_plan_start';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- The fence refuses a write once a deletion is requested, the sweep skips that family, and the deletion removes the row.
  update public.parents set deletion_requested_at = now() where id = p;
  set local role service_role;
  begin
    perform public.record_card_update(p, card, 'cs_fence', t0 + interval '1 day', 'pm_fence');
    raise exception 'the fence let a card through';
  exception when sqlstate '55000' then null;
  end;
  begin
    perform public.begin_plan_start(card, 'key-fence', 'pm_fence');
    raise exception 'the fence let a plan start through';
  exception when sqlstate '55000' then null;
  end;
  select count(*) into n from public.card_update_rows(p_card => card);
  if n <> 0 then raise exception 'a family being deleted read % rows', n; end if;
  reset role;
  delete from public.parents where id = p;
  select count(*) into n from public.child_card_updates where parent_id = p or child_id = child;
  if n <> 0 then raise exception 'deleting the family left % rows', n; end if;

  raise exception 'PROBE_OK';
end $$;
