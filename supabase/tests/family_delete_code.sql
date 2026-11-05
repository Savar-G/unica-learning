-- Hosted probe for the family delete's one-time code (#603). Every row is synthetic and made inside this block, and the final
-- exception rolls it all back, so a run that reaches the end reports PROBE_OK and leaves nothing. It removes no row of any
-- family and makes no provider call. Run it with the Management API, with the migration's text in front of it when the
-- migration is not applied yet.
--
-- The functions read the database's clock, and no caller can move it. So the probe dates a past send or lock by writing it to a
-- synthetic row, and takes each expected time from what the row holds.
do $$
declare
  p uuid := gen_random_uuid(); other uuid := gen_random_uuid(); late uuid := gen_random_uuid();
  day_last uuid := gen_random_uuid(); hour_last uuid := gen_random_uuid();
  t0 timestamptz := clock_timestamp();
  sent_after timestamptz; sent_before timestamptz; kept_end timestamptz; first_send timestamptz; lock_end timestamptz;
  times timestamptz[];
  c record; n integer; denied boolean; source text;
begin
  insert into auth.users(id, email) select id, id::text || '@example.invalid' from unnest(array[p, other, late, day_last, hour_last]) id;
  insert into public.parents(id, name, email, postal) select id, 'Probe parent', id::text || '@example.invalid', 'V6B 1A1' from unnest(array[p, other, late, day_last, hour_last]) id;

  set local role service_role;

  -- No code yet: no row to read.
  select count(*) into n from public.read_family_delete_code(p);
  if n <> 0 then raise exception 'read before a send: %', n; end if;

  -- A send stores the hash and its end, 10 minutes from the database's clock at the send. now() is the transaction's start and is
  -- more than a second old here, so a function that used now() would give an end before the lower bound.
  perform pg_sleep(1.1);
  sent_after := clock_timestamp();
  if sent_after - now() < interval '1 second' then raise exception 'not binding: now() is not behind the clock'; end if;
  select * into c from public.begin_family_delete_code(p, 'hash-1', 600, 3, 3600, 6, 86400);
  sent_before := clock_timestamp();
  if c.out_status <> 'ok' then raise exception 'send 1: %', c.out_status; end if;
  select * into c from public.read_family_delete_code(p);
  if c.out_hash <> 'hash-1' then raise exception 'read 1: %', c.out_hash; end if;
  if c.out_expires_at < sent_after + interval '10 minutes' or c.out_expires_at > sent_before + interval '10 minutes' then
    raise exception 'the end is not 10 minutes from the clock: % between % and %', c.out_expires_at, sent_after, sent_before;
  end if;
  kept_end := c.out_expires_at;

  -- An app clock 5 minutes ahead cannot extend the code. The function that takes a time refuses the service role, so no time reaches
  -- the row: the end and the hash stay, and the end is not 15 minutes from the clock.
  denied := false;
  begin
    perform * from public.begin_family_delete_code(p, 'hash-ahead', clock_timestamp() + interval '5 minutes', 600, 3, 3600, 6, 86400);
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'the service role passed a time to the send'; end if;
  select * into c from public.read_family_delete_code(p);
  if c.out_hash <> 'hash-1' or c.out_expires_at <> kept_end then raise exception 'a refused time changed the code: % %', c.out_hash, c.out_expires_at; end if;
  if kept_end > clock_timestamp() + interval '10 minutes' then raise exception 'the code has more than 10 minutes: %', kept_end; end if;
  -- The old spend, which took a time, refuses the service role too, and leaves the code.
  denied := false;
  begin
    perform public.spend_family_delete_code(p, 'hash-1', clock_timestamp());
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'the service role passed a time to the spend'; end if;
  select count(*) into n from public.read_family_delete_code(p) where out_hash = 'hash-1';
  if n <> 1 then raise exception 'a refused spend changed the code: %', n; end if;

  -- A new send replaces the code. Only this parent's row changes.
  select count(*) into n from public.read_family_delete_code(other);
  if n <> 0 then raise exception 'another parent has a code: %', n; end if;
  select * into c from public.begin_family_delete_code(p, 'hash-2', 600, 3, 3600, 6, 86400);
  if c.out_status <> 'ok' then raise exception 'send 2: %', c.out_status; end if;
  if public.consume_family_delete_code(p, 'hash-1') then raise exception 'the replaced code was spent'; end if;

  -- A code whose end has passed reads as no code and cannot be spent.
  reset role;
  insert into public.family_delete_codes(parent_id, code_hash, expires_at) values (late, 'hash-old', clock_timestamp() - interval '1 millisecond');
  set local role service_role;
  select count(*) into n from public.read_family_delete_code(late);
  if n <> 0 then raise exception 'an ended code was read: %', n; end if;
  if public.consume_family_delete_code(late, 'hash-old') then raise exception 'an ended code was spent'; end if;

  -- A code that ends during the check. It is live when read, then the check takes longer than the code has left, and the spend
  -- refuses it. The send's clock is not now(): the code is sent more than a second after the transaction's start, with 1 second to
  -- live, so now() is still before its end here and a spend that used now() would pass it.
  select * into c from public.begin_family_delete_code(late, 'hash-late', 1, 3, 3600, 6, 86400);
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

  -- The clock is read after the lock, in the send and in the spend: in each function's text the row lock comes first, and now() is
  -- not used. The send takes no time at all.
  select prosrc into source from pg_proc where oid = 'public.consume_family_delete_code(uuid, text)'::regprocedure;
  if position('for update' in source) = 0 or position('clock_timestamp()' in source) < position('for update' in source) or source ~ 'now\(\)' then
    raise exception 'the spend does not read the clock after the lock';
  end if;
  select prosrc into source from pg_proc where oid = 'public.begin_family_delete_code(uuid, text, int, int, int, int, int)'::regprocedure;
  if position('for update' in source) = 0 or position('clock_timestamp()' in source) < position('for update' in source) or source ~ 'now\(\)' then
    raise exception 'the send does not read the clock after the lock';
  end if;
  select count(*) into n from pg_proc f join pg_namespace s on s.oid = f.pronamespace
    where s.nspname = 'public' and f.proname in ('begin_family_delete_code', 'spend_family_delete_code', 'consume_family_delete_code', 'read_family_delete_code')
      and 'timestamptz'::regtype = any(f.proargtypes::oid[]::regtype[]) and has_function_privilege('service_role', f.oid, 'execute');
  if n <> 0 then raise exception 'the service role can call % code functions that take a time', n; end if;
  set local role service_role;

  -- The third send in the hour goes, the fourth is refused with the time the first leaves the window.
  select * into c from public.begin_family_delete_code(p, 'hash-3', 600, 3, 3600, 6, 86400);
  if c.out_status <> 'ok' then raise exception 'send 3: %', c.out_status; end if;
  reset role;
  select send_times[1] into first_send from public.family_delete_codes where parent_id = p;
  set local role service_role;
  select * into c from public.begin_family_delete_code(p, 'hash-4', 600, 3, 3600, 6, 86400);
  if c.out_status <> 'too_many' or c.out_retry_at <> first_send + interval '1 hour' then raise exception 'send 4: % %', c.out_status, c.out_retry_at; end if;
  select * into c from public.read_family_delete_code(p);
  if c.out_hash <> 'hash-3' then raise exception 'a refused send changed the code: %', c.out_hash; end if;

  -- A code works once: of two spends, one gets true. Read after: no live code.
  if not public.consume_family_delete_code(p, 'hash-3') then raise exception 'the live code was not spent'; end if;
  if public.consume_family_delete_code(p, 'hash-3') then raise exception 'a code was spent twice'; end if;
  if public.consume_family_delete_code(p, null) then raise exception 'a null hash spent a spent code'; end if;
  select * into c from public.read_family_delete_code(p);
  if c.out_hash is not null or c.out_expires_at is not null then raise exception 'a spent code is still there'; end if;

  -- The day's limit: 6 in any 24 hours, even when no hour holds 3. The seventh is refused.
  times := array[t0 - interval '20 hours', t0 - interval '18 hours', t0 - interval '16 hours', t0 - interval '14 hours', t0 - interval '12 hours', t0 - interval '10 hours'];
  reset role;
  update public.family_delete_codes set send_times = times where parent_id = p;
  set local role service_role;
  select * into c from public.begin_family_delete_code(p, 'hash-d7', 600, 3, 3600, 6, 86400);
  if c.out_status <> 'too_many' or c.out_retry_at <> times[1] + interval '24 hours' then raise exception 'day limit: % %', c.out_status, c.out_retry_at; end if;
  -- After the window an old send no longer counts, and it leaves the list.
  times[1] := t0 - interval '25 hours';
  reset role;
  update public.family_delete_codes set send_times = times where parent_id = p;
  set local role service_role;
  select * into c from public.begin_family_delete_code(p, 'hash-next', 600, 3, 3600, 6, 86400);
  if c.out_status <> 'ok' then raise exception 'after the day: %', c.out_status; end if;
  reset role;
  select cardinality(send_times), send_times[1] into n, first_send from public.family_delete_codes where parent_id = p;
  if n <> 6 or first_send <> times[2] then raise exception 'the send list: % %', n, first_send; end if;
  set local role service_role;

  -- Both limits full: the answer is the later time. Three sends, a gap, three more. The hour has room in 57 minutes, but the day has
  -- none until the first send leaves it.
  times := array[t0 - interval '64 minutes', t0 - interval '63 minutes', t0 - interval '62 minutes', t0 - interval '3 minutes', t0 - interval '2 minutes', t0 - interval '1 minute'];
  reset role;
  insert into public.family_delete_codes(parent_id, send_times) values (day_last, times);
  set local role service_role;
  select * into c from public.begin_family_delete_code(day_last, 'hash-b7', 600, 3, 3600, 6, 86400);
  if c.out_status <> 'too_many' or c.out_retry_at <> times[1] + interval '24 hours' then raise exception 'both limits, the day last: % %', c.out_status, c.out_retry_at; end if;
  -- At the answered time a send goes: the same sends, a day later.
  times := array[t0 - interval '24 hours', t0 - interval '1439 minutes', t0 - interval '1438 minutes', t0 - interval '1379 minutes', t0 - interval '1378 minutes', t0 - interval '1377 minutes'];
  reset role;
  update public.family_delete_codes set send_times = times where parent_id = day_last;
  set local role service_role;
  select * into c from public.begin_family_delete_code(day_last, 'hash-b8', 600, 3, 3600, 6, 86400);
  if c.out_status <> 'ok' then raise exception 'at the answered time: %', c.out_status; end if;
  -- The other order: the day has room first, and the hour's time is the later one.
  times := array[t0 - interval '1420 minutes', t0 - interval '1360 minutes', t0 - interval '1300 minutes', t0 - interval '30 minutes', t0 - interval '20 minutes', t0 - interval '10 minutes'];
  reset role;
  insert into public.family_delete_codes(parent_id, send_times) values (hour_last, times);
  set local role service_role;
  select * into c from public.begin_family_delete_code(hour_last, 'hash-h7', 600, 3, 3600, 6, 86400);
  if c.out_status <> 'too_many' or c.out_retry_at <> times[4] + interval '1 hour' then raise exception 'both limits, the hour last: % %', c.out_status, c.out_retry_at; end if;

  -- During the tries' lock no code goes. The existing claim sets the lock.
  for n in 1..5 loop perform * from public.claim_family_delete_attempt(other, clock_timestamp(), 5, 900); end loop;
  reset role;
  select locked_until into lock_end from public.family_delete_attempts where parent_id = other;
  set local role service_role;
  select * into c from public.begin_family_delete_code(other, 'hash-x', 600, 3, 3600, 6, 86400);
  if c.out_status <> 'locked' or c.out_retry_at <> lock_end then raise exception 'under the lock: % %', c.out_status, c.out_retry_at; end if;
  -- A lock whose end has passed by the database's clock stops nothing.
  reset role;
  update public.family_delete_attempts set locked_until = clock_timestamp() - interval '1 millisecond' where parent_id = other;
  set local role service_role;
  select * into c from public.begin_family_delete_code(other, 'hash-x', 600, 3, 3600, 6, 86400);
  if c.out_status <> 'ok' then raise exception 'after the lock: %', c.out_status; end if;

  -- A family under a deletion request can still get a code, so a frozen family can still confirm.
  reset role;
  update public.parents set deletion_requested_at = now() where id = other;
  set local role service_role;
  select * into c from public.begin_family_delete_code(other, 'hash-f', 600, 3, 3600, 6, 86400);
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
  begin perform public.begin_family_delete_code(p, 'x', 600, 3, 3600, 6, 86400); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'a parent asked for a code'; end if;
  denied := false;
  begin perform public.begin_family_delete_code(p, 'x', t0, 600, 3, 3600, 6, 86400); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'a parent asked for a code with a time'; end if;
  denied := false;
  begin perform public.read_family_delete_code(p); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'a parent read a code'; end if;
  denied := false;
  begin perform public.consume_family_delete_code(p, 'x'); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'a parent spent a code'; end if;
  denied := false;
  begin perform public.spend_family_delete_code(p, 'x', t0); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'a parent spent a code with a time'; end if;
  denied := false;
  begin perform 1 from public.family_delete_codes; exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'a parent read the table'; end if;
  reset role;
  set local role anon;
  denied := false;
  begin perform public.begin_family_delete_code(p, 'x', 600, 3, 3600, 6, 86400); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'anon asked for a code'; end if;
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
