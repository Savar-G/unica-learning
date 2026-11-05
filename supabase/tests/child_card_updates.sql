-- Hosted probe for public.child_card_updates (#554). All rows are synthetic. The final exception rolls everything back, so
-- a run that reaches the end reports PROBE_OK and leaves nothing. Run it with the Supabase MCP `execute_sql`; see docs/parent-dashboard.md.
-- No provider calls.
do $$
declare
  p uuid := gen_random_uuid(); other uuid := gen_random_uuid(); child uuid := gen_random_uuid(); child_other uuid := gen_random_uuid(); child_third uuid := gen_random_uuid();
  card uuid; card_other uuid; card_third uuid;
  n integer; r text; s public.child_card_updates; applied timestamptz; j jsonb; token uuid; old_token uuid; b boolean;
  t0 timestamptz := '2026-11-01 00:00:00+00';
begin
  insert into auth.users(id, email) values (p, p::text || '@example.invalid'), (other, other::text || '@example.invalid');
  insert into public.parents(id, name, email, postal) values
    (p, 'Probe parent', p::text || '@example.invalid', 'V6B 1A1'), (other, 'Probe other', other::text || '@example.invalid', 'V6B 1A1');
  insert into public.children(id, parent_id, first_name, grade, province) values
    (child, p, 'Probe A', 3, 'BC'), (child_other, other, 'Probe B', 3, 'BC'), (child_third, p, 'Probe C', 3, 'BC');
  insert into public.card_setups(parent_id, child_id, plan, price, stripe_customer_id, workbook_welcome_enabled)
    values (p, child, 'one', 79.99, 'cus_probe_' || replace(p::text, '-', ''), false) returning id into card;
  insert into public.card_setups(parent_id, child_id, plan, price, stripe_customer_id, workbook_welcome_enabled)
    values (other, child_other, 'one', 79.99, 'cus_probe_' || replace(other::text, '-', ''), false) returning id into card_other;
  insert into public.card_setups(parent_id, child_id, plan, price, stripe_customer_id, workbook_welcome_enabled)
    values (p, child_third, 'one', 79.99, 'cus_probe_third_' || replace(p::text, '-', ''), false) returning id into card_third;

  set local role service_role;

  -- Another family's card setup writes nothing.
  r := public.claim_card_update(p, card_other, 'cs_a', t0);
  if r <> 'no_match' then raise exception 'another family answered %', r; end if;
  select count(*) into n from public.child_card_updates;
  r := public.finish_card_update(p, card_other, 'cs_a');
  if r is not null then raise exception 'finish for another family answered %', r; end if;

  -- The first update takes the row. A repeat before its write finished may try again.
  r := public.claim_card_update(p, card, 'cs_a', t0);
  if r <> 'apply' then raise exception 'first claim answered %', r; end if;
  r := public.claim_card_update(p, card, 'cs_a', t0);
  if r <> 'apply' then raise exception 'retry before the finish answered %', r; end if;

  -- After the finish, the same session changes nothing.
  r := public.finish_card_update(p, card, 'cs_a');
  if r <> 'cs_a' then raise exception 'finish answered %', r; end if;
  select * into s from public.child_card_updates where child_id = child;
  if s.applied_at is null or s.parent_id <> p then raise exception 'finish did not mark the row'; end if;
  applied := s.applied_at;
  r := public.claim_card_update(p, card, 'cs_a', t0);
  if r <> 'stale' then raise exception 'same session after the finish answered %', r; end if;

  -- A, B, A again leaves B.
  r := public.claim_card_update(p, card, 'cs_b', t0 + interval '1 minute');
  if r <> 'apply' then raise exception 'newer claim answered %', r; end if;
  select * into s from public.child_card_updates where child_id = child;
  if s.session_id <> 'cs_b' or s.applied_at is not null then raise exception 'newer claim did not take the row'; end if;
  r := public.finish_card_update(p, card, 'cs_b');
  if r <> 'cs_b' then raise exception 'finish of B answered %', r; end if;
  r := public.claim_card_update(p, card, 'cs_a', t0);
  if r <> 'stale' then raise exception 'A again answered %', r; end if;
  select * into s from public.child_card_updates where child_id = child;
  if s.session_id <> 'cs_b' or s.session_created_at <> t0 + interval '1 minute' or s.applied_at is null then raise exception 'A again changed the row'; end if;

  -- An older session whose write lands late is told who holds the row, and marks nothing.
  r := public.finish_card_update(p, card, 'cs_a');
  if r <> 'cs_b' then raise exception 'late finish answered %', r; end if;

  -- An older session that never held the row is stale too.
  r := public.claim_card_update(p, card, 'cs_0', t0 - interval '1 day');
  if r <> 'stale' then raise exception 'older session answered %', r; end if;

  -- Two sessions of the same second take the order of their ids, so the order never flips.
  r := public.claim_card_update(p, card, 'cs_m', t0 + interval '2 minutes');
  if r <> 'apply' then raise exception 'cs_m answered %', r; end if;
  perform public.finish_card_update(p, card, 'cs_m');
  r := public.claim_card_update(p, card, 'cs_Z', t0 + interval '2 minutes');
  if r <> 'stale' then raise exception 'lower id of the same second answered %', r; end if;
  r := public.claim_card_update(p, card, 'cs_z', t0 + interval '2 minutes');
  if r <> 'apply' then raise exception 'higher id of the same second answered %', r; end if;
  r := public.claim_card_update(p, card, 'cs_m', t0 + interval '2 minutes');
  if r <> 'stale' then raise exception 'the same second back again answered %', r; end if;

  -- Rows from before the card lock: their session has no card. An unfinished write gets the card and takes the lock; 'cs_z'
  -- above never finished.
  j := public.take_card_lock(card, 120, p, 'cs_z', t0 + interval '2 minutes', 'pm_z');
  if j->>'state' <> 'taken' or j->>'payment_method' <> 'pm_z' or not (j->>'needs_repair')::boolean or (j->>'recorded')::boolean then raise exception 'old unfinished row answered %', j; end if;
  j := public.finish_card_lock(card, (j->>'token')::uuid, 'cs_z', true);
  if j->>'state' <> 'done' then raise exception 'old unfinished row finish answered %', j; end if;
  -- A finished one gets the card and has nothing to write.
  r := public.claim_card_update(p, card_third, 'cs_f', t0);
  perform public.finish_card_update(p, card_third, 'cs_f');
  j := public.take_card_lock(card_third, 120, p, 'cs_f', t0, 'pm_f');
  if j->>'state' <> 'clean' then raise exception 'old finished row answered %', j; end if;
  select * into s from public.child_card_updates where child_id = child_third;
  if s.payment_method_id <> 'pm_f' or s.needs_repair or s.lock_token is not null then raise exception 'old finished row did not keep its card'; end if;

  -- The card lock (migration card_update_lock), on the other family's child, which has no row yet.
  -- A plan start on a child with no update makes a row with no session and no card, and holds the lock.
  j := public.take_card_lock(card_other, 120);
  if j->>'state' <> 'taken' or j->>'session' is not null or j->>'payment_method' is not null or (j->>'needs_repair')::boolean then raise exception 'plan start took %', j; end if;
  token := (j->>'token')::uuid;
  j := public.take_card_lock(card_other, 120);
  if j->>'state' <> 'busy' then raise exception 'second plan start answered %', j; end if;

  -- Another family's parent writes nothing, and the lock is not theirs.
  j := public.take_card_lock(card_other, 120, p, 'cs_l1', t0, 'pm_l1');
  if j->>'state' <> 'no_match' then raise exception 'wrong parent answered %', j; end if;

  -- A return while the lock is busy still records its card, so the holder sees it.
  j := public.take_card_lock(card_other, 120, other, 'cs_l1', t0, 'pm_l1');
  if j->>'state' <> 'busy' or not (j->>'recorded')::boolean then raise exception 'return under the lock answered %', j; end if;
  select * into s from public.child_card_updates where child_id = child_other;
  if s.session_id <> 'cs_l1' or s.payment_method_id <> 'pm_l1' or not s.needs_repair or s.applied_at is not null then raise exception 'the busy return did not record the card'; end if;

  -- The holder is handed the newer card. Another token is told it lost.
  j := public.finish_card_lock(card_other, token, null, true);
  if j->>'state' <> 'newer' or j->>'session' <> 'cs_l1' or j->>'payment_method' <> 'pm_l1' then raise exception 'plan start finish answered %', j; end if;
  j := public.finish_card_lock(card_other, gen_random_uuid(), 'cs_l1', true);
  if j->>'state' <> 'lost' then raise exception 'wrong token answered %', j; end if;

  -- A failed write marks nothing and keeps the lock.
  j := public.finish_card_lock(card_other, token, 'cs_l1', false);
  if j->>'state' <> 'unchanged' then raise exception 'failed write answered %', j; end if;
  select * into s from public.child_card_updates where child_id = child_other;
  if not s.needs_repair or s.lock_token is distinct from token then raise exception 'a failed write changed the row'; end if;

  -- A finished write clears the flag and frees the lock in one step.
  j := public.finish_card_lock(card_other, token, 'cs_l1', true);
  if j->>'state' <> 'done' then raise exception 'finish answered %', j; end if;
  select * into s from public.child_card_updates where child_id = child_other;
  if s.needs_repair or s.lock_token is not null or s.lock_expires_at is not null or s.applied_at is null then raise exception 'done did not clear the row'; end if;

  -- The same return again, or an older one, has nothing to write and takes no lock.
  j := public.take_card_lock(card_other, 120, other, 'cs_l1', t0, 'pm_l1');
  if j->>'state' <> 'clean' or (j->>'recorded')::boolean then raise exception 'reopened return answered %', j; end if;
  j := public.take_card_lock(card_other, 120, other, 'cs_l0', t0 - interval '1 day', 'pm_l0');
  if j->>'state' <> 'clean' or j->>'session' <> 'cs_l1' then raise exception 'older return answered %', j; end if;
  select * into s from public.child_card_updates where child_id = child_other;
  if s.payment_method_id <> 'pm_l1' or s.lock_token is not null then raise exception 'an older return changed the row'; end if;

  -- A crash leaves the flag set: a release keeps it, and any return, even an older one, then takes the lock to repair it.
  j := public.take_card_lock(card_other, 120, other, 'cs_l2', t0 + interval '1 minute', 'pm_l2');
  if j->>'state' <> 'taken' or not (j->>'recorded')::boolean or j->>'payment_method' <> 'pm_l2' then raise exception 'newer return answered %', j; end if;
  token := (j->>'token')::uuid;
  b := public.release_card_lock(card_other, gen_random_uuid());
  if b then raise exception 'a wrong token released the lock'; end if;
  b := public.release_card_lock(card_other, token);
  if not b then raise exception 'the holder could not release'; end if;
  select * into s from public.child_card_updates where child_id = child_other;
  if not s.needs_repair or s.lock_token is not null then raise exception 'release changed the flag'; end if;
  j := public.take_card_lock(card_other, 120, other, 'cs_l0', t0 - interval '1 day', 'pm_l0');
  if j->>'state' <> 'taken' or j->>'session' <> 'cs_l2' or j->>'payment_method' <> 'pm_l2' or not (j->>'needs_repair')::boolean or (j->>'recorded')::boolean then raise exception 'older return did not take the repair: %', j; end if;
  old_token := (j->>'token')::uuid;

  -- An expired lock can be taken, and its old holder has lost it.
  reset role;
  update public.child_card_updates set lock_expires_at = now() - interval '1 second' where child_id = child_other;
  set local role service_role;
  j := public.take_card_lock(card_other, 120);
  if j->>'state' <> 'taken' or (j->>'token')::uuid = old_token or not (j->>'needs_repair')::boolean then raise exception 'expired lock answered %', j; end if;
  token := (j->>'token')::uuid;
  j := public.finish_card_lock(card_other, old_token, 'cs_l2', true);
  if j->>'state' <> 'lost' then raise exception 'old holder answered %', j; end if;
  b := public.release_card_lock(card_other, old_token);
  if b then raise exception 'the old holder released the new lock'; end if;

  -- A plan start that holds the row's card and has nothing newer finishes it.
  j := public.finish_card_lock(card_other, token, 'cs_l2', true);
  if j->>'state' <> 'done' then raise exception 'plan start finish answered %', j; end if;

  -- Bad arguments write nothing.
  begin
    j := public.take_card_lock(card_other, 5);
    raise exception 'a short lock was taken';
  exception when sqlstate '22023' then null;
  end;
  begin
    j := public.take_card_lock(card_other, 120, other, 'cs_l9', t0, null);
    raise exception 'a session with no card was recorded';
  exception when sqlstate '22023' then null;
  end;

  -- The service role has no direct write.
  begin
    update public.child_card_updates set session_id = 'cs_direct';
    raise exception 'the service role updated directly';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.child_card_updates;
    raise exception 'the service role deleted directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.child_card_updates(child_id, parent_id, session_id, session_created_at) values (child_other, other, 'cs_direct', t0);
    raise exception 'the service role inserted directly';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- The owner, another parent and anon read nothing and call nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.child_card_updates;
  if n <> 0 then raise exception 'the owner read % rows', n; end if;
  begin
    perform public.claim_card_update(p, card, 'cs_parent', t0 + interval '1 day');
    raise exception 'a parent called the claim';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.finish_card_update(p, card, 'cs_parent');
    raise exception 'a parent called the finish';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.take_card_lock(card, 120);
    raise exception 'a parent called take_card_lock';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.finish_card_lock(card, gen_random_uuid(), null, true);
    raise exception 'a parent called finish_card_lock';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.release_card_lock(card, gen_random_uuid());
    raise exception 'a parent called release_card_lock';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.child_card_updates set session_id = 'cs_parent';
    raise exception 'a parent updated the table';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.child_card_updates;
  if n <> 0 then raise exception 'another parent read % rows', n; end if;
  reset role;
  set local role anon;
  begin
    perform count(*) from public.child_card_updates;
    raise exception 'anon read the table';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.claim_card_update(p, card, 'cs_anon', t0 + interval '1 day');
    raise exception 'anon called the claim';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.finish_card_update(p, card, 'cs_anon');
    raise exception 'anon called the finish';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.take_card_lock(card, 120);
    raise exception 'anon called take_card_lock';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.finish_card_lock(card, gen_random_uuid(), null, true);
    raise exception 'anon called finish_card_lock';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.release_card_lock(card, gen_random_uuid());
    raise exception 'anon called release_card_lock';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- The family write fence refuses a write once a deletion is requested, and the deletion removes the row.
  update public.parents set deletion_requested_at = now() where id = p;
  set local role service_role;
  begin
    perform public.claim_card_update(p, card, 'cs_fence', t0 + interval '1 day');
    raise exception 'the fence let a write through';
  exception when sqlstate '55000' then null;
  end;
  begin
    perform public.take_card_lock(card, 120);
    raise exception 'the fence let a lock through';
  exception when sqlstate '55000' then null;
  end;
  reset role;
  delete from public.parents where id = p;
  select count(*) into n from public.child_card_updates where parent_id = p or child_id = child;
  if n <> 0 then raise exception 'deleting the family left % rows', n; end if;

  raise exception 'PROBE_OK';
end $$;
