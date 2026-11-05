-- Hosted probe for the family delete's one-time code (#603). Every row is synthetic and made inside this block, and the final
-- exception rolls it all back, so a run that reaches the end reports PROBE_OK and leaves nothing. It removes no row of any
-- family and makes no provider call. Run it with the Management API, with the migration's text in front of it when the
-- migration is not applied yet.
do $$
declare
  p uuid := gen_random_uuid(); other uuid := gen_random_uuid(); late uuid := gen_random_uuid();
  day_last uuid := gen_random_uuid(); hour_last uuid := gen_random_uuid();
  -- The sends below are dated from here. A read and a spend use the database's own clock, so a code sent "at" t0 is live.
  t0 timestamptz := clock_timestamp();
  c record; n integer; denied boolean; source text;
begin
  insert into auth.users(id, email) select id, id::text || '@example.invalid' from unnest(array[p, other, late, day_last, hour_last]) id;
  insert into public.parents(id, name, email, postal) select id, 'Probe parent', id::text || '@example.invalid', 'V6B 1A1' from unnest(array[p, other, late, day_last, hour_last]) id;

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
  if public.consume_family_delete_code(p, 'hash-1') then raise exception 'the replaced code was spent'; end if;

  -- The code ends after 10 minutes, by the database's clock. A code sent 10 minutes ago reads as no code and cannot be spent.
  select * into c from public.begin_family_delete_code(late, 'hash-old', clock_timestamp() - interval '10 minutes', 600, 3, 3600, 6, 86400);
  if c.out_status <> 'ok' then raise exception 'old send: %', c.out_status; end if;
  select count(*) into n from public.read_family_delete_code(late);
  if n <> 0 then raise exception 'an ended code was read: %', n; end if;
  if public.consume_family_delete_code(late, 'hash-old') then raise exception 'an ended code was spent'; end if;

  -- A code that ends during the check. It is live when read, then the check takes longer than the code has left, and the spend
  -- refuses it. now() is the transaction's start and is still before the end here, so a spend that used now() would pass it.
  select * into c from public.begin_family_delete_code(late, 'hash-late', clock_timestamp(), 1, 3, 3600, 6, 86400);
  if c.out_status <> 'ok' then raise exception 'late send: %', c.out_status; end if;
  select * into c from public.read_family_delete_code(late);
  if c.out_hash is distinct from 'hash-late' then raise exception 'a live code was not read: %', c.out_hash; end if;
  if now() >= c.out_expires_at then raise exception 'not binding: now() is past the end'; end if;
  perform pg_sleep(1.2);
  if clock_timestamp() <= c.out_expires_at then raise exception 'not binding: the clock is before the end'; end if;
  if public.consume_family_delete_code(late, 'hash-late') then raise exception 'a code that ended during the check was spent'; end if;
  reset role;
  select count(*) into n from public.family_delete_codes where parent_id = late and code_hash = 'hash-late';
  if n <> 1 then raise exception 'a refused spend changed the code: %', n; end if;
  -- The clock is read after the lock: in the function's text the row lock comes first, and now() is not used.
  select prosrc into source from pg_proc where oid = 'public.consume_family_delete_code(uuid, text)'::regprocedure;
  if position('for update' in source) = 0 or position('clock_timestamp()' in source) < position('for update' in source) or source ~ 'now\(\)' then
    raise exception 'the spend does not read the clock after the lock';
  end if;
  set local role service_role;

  -- The third send in the hour goes, the fourth is refused with the time the first leaves the window.
  select * into c from public.begin_family_delete_code(p, 'hash-3', t0 + interval '2 minutes', 600, 3, 3600, 6, 86400);
  if c.out_status <> 'ok' then raise exception 'send 3: %', c.out_status; end if;
  select * into c from public.begin_family_delete_code(p, 'hash-4', t0 + interval '3 minutes', 600, 3, 3600, 6, 86400);
  if c.out_status <> 'too_many' or c.out_retry_at <> t0 + interval '1 hour' then raise exception 'send 4: % %', c.out_status, c.out_retry_at; end if;
  select * into c from public.read_family_delete_code(p);
  if c.out_hash <> 'hash-3' then raise exception 'a refused send changed the code: %', c.out_hash; end if;

  -- A code works once: of two spends, one gets true. Read after: no live code.
  if not public.consume_family_delete_code(p, 'hash-3') then raise exception 'the live code was not spent'; end if;
  if public.consume_family_delete_code(p, 'hash-3') then raise exception 'a code was spent twice'; end if;
  if public.consume_family_delete_code(p, null) then raise exception 'a null hash spent a spent code'; end if;
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

  -- Both limits full: the answer is the later time. Three sends, a gap, three more. An hour after the fourth the hour has room,
  -- but the day has none until the first send leaves it.
  foreach c.out_retry_at in array array[t0, t0 + interval '1 minute', t0 + interval '2 minutes', t0 + interval '61 minutes', t0 + interval '62 minutes', t0 + interval '63 minutes'] loop
    perform * from public.begin_family_delete_code(day_last, 'hash-b', c.out_retry_at, 600, 3, 3600, 6, 86400);
  end loop;
  select * into c from public.begin_family_delete_code(day_last, 'hash-b7', t0 + interval '64 minutes', 600, 3, 3600, 6, 86400);
  if c.out_status <> 'too_many' or c.out_retry_at <> t0 + interval '24 hours' then raise exception 'both limits, the day last: % %', c.out_status, c.out_retry_at; end if;
  select * into c from public.begin_family_delete_code(day_last, 'hash-b8', t0 + interval '24 hours', 600, 3, 3600, 6, 86400);
  if c.out_status <> 'ok' then raise exception 'at the answered time: %', c.out_status; end if;
  -- The other order: the day has room first, and the hour's time is the later one.
  foreach c.out_retry_at in array array[t0, t0 + interval '60 minutes', t0 + interval '120 minutes', t0 + interval '1390 minutes', t0 + interval '1400 minutes', t0 + interval '1410 minutes'] loop
    perform * from public.begin_family_delete_code(hour_last, 'hash-h', c.out_retry_at, 600, 3, 3600, 6, 86400);
  end loop;
  select * into c from public.begin_family_delete_code(hour_last, 'hash-h7', t0 + interval '1420 minutes', 600, 3, 3600, 6, 86400);
  if c.out_status <> 'too_many' or c.out_retry_at <> t0 + interval '1450 minutes' then raise exception 'both limits, the hour last: % %', c.out_status, c.out_retry_at; end if;

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
  begin perform public.consume_family_delete_code(p, 'x'); exception when insufficient_privilege then denied := true; end;
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
  begin perform public.consume_family_delete_code(p, 'x'); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'anon spent a code'; end if;
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
