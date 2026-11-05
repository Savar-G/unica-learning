-- Hosted probe for the self-serve family delete (#556). All rows are synthetic, made inside this block. The final exception
-- rolls everything back, so a run that reaches the end reports PROBE_OK and leaves nothing. It deletes no family and
-- removes no Auth user: the cascade is read from the catalog. No provider calls. Run it with the Management API.
do $$
declare
  p uuid := gen_random_uuid(); other uuid := gen_random_uuid(); keeper uuid := gen_random_uuid();
  hold uuid := gen_random_uuid();
  r text; n integer; c record; denied boolean;
  t0 timestamptz := '2026-11-05 00:00:00+00';
begin
  insert into auth.users(id, email) values (p, p::text || '@example.invalid'), (other, other::text || '@example.invalid');
  insert into public.parents(id, name, email, postal) values
    (p, 'Probe parent', p::text || '@example.invalid', 'V6B 1A1'), (other, 'Probe other', other::text || '@example.invalid', 'V6B 1A1');

  set local role service_role;

  -- Five tries count, the fifth locks, a claim during the lock changes nothing, and a lock that has ended starts again.
  for n in 1..5 loop
    select * into c from public.claim_family_delete_attempt(p, t0, 5, 900);
    if c.out_status <> 'open' or c.out_attempts_left <> 5 - n then raise exception 'try %: % left %', n, c.out_status, c.out_attempts_left; end if;
  end loop;
  if c.out_locked_until <> t0 + interval '15 minutes' then raise exception 'fifth try locked until %', c.out_locked_until; end if;
  select * into c from public.claim_family_delete_attempt(p, t0 + interval '14 minutes', 5, 900);
  if c.out_status <> 'locked' or c.out_locked_until <> t0 + interval '15 minutes' then raise exception 'during lock: %', c.out_status; end if;
  select * into c from public.claim_family_delete_attempt(p, t0 + interval '15 minutes', 5, 900);
  if c.out_status <> 'open' or c.out_attempts_left <> 4 then raise exception 'after lock: % left %', c.out_status, c.out_attempts_left; end if;

  -- A right password clears the count.
  perform public.clear_family_delete_attempts(p);
  select * into c from public.claim_family_delete_attempt(p, t0, 5, 900);
  if c.out_attempts_left <> 4 then raise exception 'after clear left %', c.out_attempts_left; end if;

  -- The service role cannot read or change the table directly.
  denied := false;
  begin perform 1 from public.family_delete_attempts; exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'service role read the attempts table'; end if;

  -- A parent and anon cannot call the functions or read the table.
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p::text, 'role', 'authenticated')::text, true);
  denied := false;
  begin perform public.request_parent_family_deletion(p); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'a parent called the request'; end if;
  denied := false;
  begin perform public.claim_family_delete_attempt(p, t0, 5, 900); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'a parent called the claim'; end if;
  denied := false;
  begin perform public.clear_family_delete_attempts(p); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'a parent called the clear'; end if;
  denied := false;
  begin perform 1 from public.family_delete_attempts; exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'a parent read the attempts table'; end if;
  reset role;
  set local role anon;
  denied := false;
  begin perform public.request_parent_family_deletion(p); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'anon called the request'; end if;
  reset role;

  -- Admin accounts are protected; an unknown parent is missing. A check writes nothing.
  select user_id into keeper from public.admin_users limit 1;
  if keeper is not null then
    set local role service_role;
    r := public.request_parent_family_deletion(keeper, true);
    if r <> 'protected' then raise exception 'admin check: %', r; end if;
    r := public.request_parent_family_deletion(keeper);
    if r <> 'protected' then raise exception 'admin request: %', r; end if;
    reset role;
  end if;
  set local role service_role;
  r := public.request_parent_family_deletion(gen_random_uuid());
  if r <> 'missing' then raise exception 'unknown parent: %', r; end if;
  r := public.request_parent_family_deletion(p, true);
  if r <> 'ready' then raise exception 'check: %', r; end if;
  reset role;
  if (select deletion_requested_at from public.parents where id = p) is not null then raise exception 'a check set the fence'; end if;
  if exists(select 1 from public.family_deletions where parent_id = p) then raise exception 'a check wrote a request'; end if;

  -- A card hold refuses both the check and the request.
  set local role service_role;
  perform public.begin_family_card_operation(p, hold);
  r := public.request_parent_family_deletion(p, true);
  if r <> 'busy' then raise exception 'check under hold: %', r; end if;
  r := public.request_parent_family_deletion(p);
  if r <> 'busy' then raise exception 'request under hold: %', r; end if;
  reset role;
  if (select deletion_requested_at from public.parents where id = p) is not null then raise exception 'the hold did not stop the fence'; end if;

  -- The plan start's hold: a second begin with the same id answers 23505, which holdPlanStart reads as already held.
  set local role service_role;
  denied := false;
  begin perform public.begin_family_card_operation(p, hold); exception when unique_violation then denied := true; end;
  if not denied then raise exception 'second begin with the same id did not answer 23505'; end if;
  perform public.end_family_card_operation(hold);

  -- The request fences the family, once, with reason request and phase checking.
  r := public.request_parent_family_deletion(p);
  if r <> 'requested' then raise exception 'request: %', r; end if;
  reset role;
  if (select deletion_requested_at from public.parents where id = p) is null then raise exception 'no fence'; end if;
  select count(*) into n from public.family_deletions where parent_id = p and reason = 'request' and phase = 'checking';
  if n <> 1 then raise exception 'request rows: %', n; end if;

  -- A second request is the same request. The password claim still works for a retry.
  set local role service_role;
  r := public.request_parent_family_deletion(p);
  if r <> 'requested' then raise exception 'second request: %', r; end if;
  select * into c from public.claim_family_delete_attempt(p, t0, 5, 900);
  if c.out_status <> 'open' then raise exception 'claim under fence: %', c.out_status; end if;

  -- Under the fence a plan start's hold answers 55000 family_unavailable, which holdPlanStart reads as fenced.
  denied := false;
  begin perform public.begin_family_card_operation(p, gen_random_uuid()); exception when sqlstate '55000' then denied := true; end;
  if not denied then raise exception 'a hold was taken under the fence'; end if;
  reset role;

  -- A family the retention job froze moves to reason request, and that job's keep can no longer reopen it.
  update public.parents set deletion_requested_at = now() where id = other;
  insert into public.family_deletions(parent_id, reason, lease_token, lease_until) values (other, 'retention', hold, now() + interval '5 minutes');
  set local role service_role;
  r := public.request_parent_family_deletion(other);
  if r <> 'requested' then raise exception 'request over retention: %', r; end if;
  if public.decide_family_deletion(other, hold, true) then raise exception 'keep reopened a parent request'; end if;
  reset role;
  if (select reason from public.family_deletions where parent_id = other) <> 'request' then raise exception 'reason did not move'; end if;
  if (select deletion_requested_at from public.parents where id = other) is null then raise exception 'keep removed the fence'; end if;

  -- The worker's own claim takes the parent's request.
  set local role service_role;
  if (public.claim_family_deletion(p, gen_random_uuid()))->>'reason' <> 'request' then raise exception 'worker claim did not read the request'; end if;
  reset role;

  -- The attempts row goes with the parent. Read from the catalog: this probe deletes nothing.
  select count(*) into n from pg_constraint where conrelid = 'public.family_delete_attempts'::regclass and contype = 'f'
    and confrelid = 'public.parents'::regclass and confdeltype = 'c';
  if n <> 1 then raise exception 'attempts cascade: %', n; end if;

  raise exception 'PROBE_OK';
end $$;
