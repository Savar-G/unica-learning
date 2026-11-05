-- Hosted probe for the family delete's one-time code (#603). Every row is synthetic and made inside this block, and the final
-- exception rolls it all back, so a run that reaches the end reports PROBE_OK and leaves nothing. It removes no row of any
-- family and makes no provider call. Run it with the Management API, with the migration's text in front of it when the
-- migration is not applied yet.
do $$
declare
  p uuid := gen_random_uuid(); other uuid := gen_random_uuid();
  t0 timestamptz := '2026-11-05 00:00:00+00';
  c record; n integer; denied boolean;
begin
  insert into auth.users(id, email) values (p, p::text || '@example.invalid'), (other, other::text || '@example.invalid');
  insert into public.parents(id, name, email, postal) values
    (p, 'Probe parent', p::text || '@example.invalid', 'V6B 1A1'), (other, 'Probe other', other::text || '@example.invalid', 'V6B 1A1');

  set local role service_role;

  -- No code yet: no row to read.
  select count(*) into n from public.read_family_delete_code(p);
  if n <> 0 then raise exception 'read before a send: %', n; end if;

  -- A send stores the hash and its end. A new send replaces it. Only this parent's row changes.
  select * into c from public.begin_family_delete_code(p, 'hash-1', t0, 600, 3, 3600, 6, 86400);
  if c.out_status <> 'ok' then raise exception 'send 1: %', c.out_status; end if;
  select * into c from public.read_family_delete_code(p);
  if c.out_hash <> 'hash-1' or c.out_expires_at <> t0 + interval '10 minutes' then raise exception 'read 1: % %', c.out_hash, c.out_expires_at; end if;
  select count(*) into n from public.read_family_delete_code(other);
  if n <> 0 then raise exception 'another parent has a code: %', n; end if;
  select * into c from public.begin_family_delete_code(p, 'hash-2', t0 + interval '1 minute', 600, 3, 3600, 6, 86400);
  if c.out_status <> 'ok' then raise exception 'send 2: %', c.out_status; end if;
  if public.spend_family_delete_code(p, 'hash-1', t0 + interval '2 minutes') then raise exception 'the replaced code was spent'; end if;

  -- The code ends after 10 minutes.
  if public.spend_family_delete_code(p, 'hash-2', t0 + interval '11 minutes') then raise exception 'an ended code was spent'; end if;

  -- The third send in the hour goes, the fourth is refused with the time the first leaves the window.
  select * into c from public.begin_family_delete_code(p, 'hash-3', t0 + interval '2 minutes', 600, 3, 3600, 6, 86400);
  if c.out_status <> 'ok' then raise exception 'send 3: %', c.out_status; end if;
  select * into c from public.begin_family_delete_code(p, 'hash-4', t0 + interval '3 minutes', 600, 3, 3600, 6, 86400);
  if c.out_status <> 'too_many' or c.out_retry_at <> t0 + interval '1 hour' then raise exception 'send 4: % %', c.out_status, c.out_retry_at; end if;
  select * into c from public.read_family_delete_code(p);
  if c.out_hash <> 'hash-3' then raise exception 'a refused send changed the code: %', c.out_hash; end if;

  -- A code works once: of two spends, one gets true. Read after: no live code.
  if not public.spend_family_delete_code(p, 'hash-3', t0 + interval '4 minutes') then raise exception 'the live code was not spent'; end if;
  if public.spend_family_delete_code(p, 'hash-3', t0 + interval '4 minutes') then raise exception 'a code was spent twice'; end if;
  select * into c from public.read_family_delete_code(p);
  if c.out_hash is not null or c.out_expires_at is not null then raise exception 'a spent code is still there'; end if;

  -- The day's limit: 6 in any 24 hours, even when no hour holds 3. Three more, spread out, and the seventh is refused.
  for n in 1..3 loop
    select * into c from public.begin_family_delete_code(p, 'hash-d', t0 + make_interval(hours => n + 1), 600, 3, 3600, 6, 86400);
    if c.out_status <> 'ok' then raise exception 'day send %: %', n, c.out_status; end if;
  end loop;
  select * into c from public.begin_family_delete_code(p, 'hash-d7', t0 + interval '10 hours', 600, 3, 3600, 6, 86400);
  if c.out_status <> 'too_many' or c.out_retry_at <> t0 + interval '24 hours' then raise exception 'day limit: % %', c.out_status, c.out_retry_at; end if;
  -- After the window the old sends no longer count.
  select * into c from public.begin_family_delete_code(p, 'hash-next', t0 + interval '30 hours', 600, 3, 3600, 6, 86400);
  if c.out_status <> 'ok' then raise exception 'after the day: %', c.out_status; end if;

  -- During the tries' lock no code goes. The existing claim sets the lock.
  for n in 1..5 loop perform * from public.claim_family_delete_attempt(other, t0, 5, 900); end loop;
  select * into c from public.begin_family_delete_code(other, 'hash-x', t0 + interval '1 minute', 600, 3, 3600, 6, 86400);
  if c.out_status <> 'locked' or c.out_retry_at <> t0 + interval '15 minutes' then raise exception 'under the lock: % %', c.out_status, c.out_retry_at; end if;
  select * into c from public.begin_family_delete_code(other, 'hash-x', t0 + interval '16 minutes', 600, 3, 3600, 6, 86400);
  if c.out_status <> 'ok' then raise exception 'after the lock: %', c.out_status; end if;

  -- A family under a deletion request can still get a code, so a frozen family can still confirm.
  reset role;
  update public.parents set deletion_requested_at = now() where id = other;
  set local role service_role;
  select * into c from public.begin_family_delete_code(other, 'hash-f', t0 + interval '20 minutes', 600, 3, 3600, 6, 86400);
  if c.out_status <> 'ok' then raise exception 'under the fence: %', c.out_status; end if;

  -- The service role reaches the table only through the functions.
  denied := false;
  begin perform 1 from public.family_delete_codes; exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'service role read the table'; end if;

  -- A parent and anon cannot call a function or read the table.
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p::text, 'role', 'authenticated')::text, true);
  denied := false;
  begin perform public.begin_family_delete_code(p, 'x', t0, 600, 3, 3600, 6, 86400); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'a parent asked for a code'; end if;
  denied := false;
  begin perform public.read_family_delete_code(p); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'a parent read a code'; end if;
  denied := false;
  begin perform public.spend_family_delete_code(p, 'x', t0); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'a parent spent a code'; end if;
  denied := false;
  begin perform 1 from public.family_delete_codes; exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'a parent read the table'; end if;
  reset role;
  set local role anon;
  denied := false;
  begin perform public.read_family_delete_code(p); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'anon read a code'; end if;
  denied := false;
  begin perform 1 from public.family_delete_codes; exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'anon read the table'; end if;
  reset role;

  -- The row goes with the parent. Read from the catalog: this probe removes nothing.
  select count(*) into n from pg_constraint where conrelid = 'public.family_delete_codes'::regclass and contype = 'f'
    and confrelid = 'public.parents'::regclass and confdeltype = 'c';
  if n <> 1 then raise exception 'cascade: %', n; end if;

  raise exception 'PROBE_OK';
end $$;
