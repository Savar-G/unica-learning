-- Hosted probe for public.child_card_updates (#554). All rows are synthetic. The final exception rolls everything back, so
-- a run that reaches the end reports PROBE_OK and leaves nothing. Run it with the Management API; see docs/parent-dashboard.md.
-- No provider calls.
do $$
declare
  p uuid := gen_random_uuid(); other uuid := gen_random_uuid(); child uuid := gen_random_uuid(); child_other uuid := gen_random_uuid();
  card uuid; card_other uuid;
  n integer; r text; s public.child_card_updates; applied timestamptz;
  t0 timestamptz := '2026-11-01 00:00:00+00';
begin
  insert into auth.users(id, email) values (p, p::text || '@example.invalid'), (other, other::text || '@example.invalid');
  insert into public.parents(id, name, email, postal) values
    (p, 'Probe parent', p::text || '@example.invalid', 'V6B 1A1'), (other, 'Probe other', other::text || '@example.invalid', 'V6B 1A1');
  insert into public.children(id, parent_id, first_name, grade, province) values
    (child, p, 'Probe A', 3, 'BC'), (child_other, other, 'Probe B', 3, 'BC');
  insert into public.card_setups(parent_id, child_id, plan, price, stripe_customer_id, workbook_welcome_enabled)
    values (p, child, 'one', 79.99, 'cus_probe_' || replace(p::text, '-', ''), false) returning id into card;
  insert into public.card_setups(parent_id, child_id, plan, price, stripe_customer_id, workbook_welcome_enabled)
    values (other, child_other, 'one', 79.99, 'cus_probe_' || replace(other::text, '-', ''), false) returning id into card_other;

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
  reset role;

  -- The family write fence refuses a write once a deletion is requested, and the deletion removes the row.
  update public.parents set deletion_requested_at = now() where id = p;
  set local role service_role;
  begin
    perform public.claim_card_update(p, card, 'cs_fence', t0 + interval '1 day');
    raise exception 'the fence let a write through';
  exception when sqlstate '55000' then null;
  end;
  reset role;
  delete from public.parents where id = p;
  select count(*) into n from public.child_card_updates where parent_id = p or child_id = child;
  if n <> 0 then raise exception 'deleting the family left % rows', n; end if;

  raise exception 'PROBE_OK';
end $$;
