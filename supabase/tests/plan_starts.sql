-- Hosted probe for migration plan_starts (#554, review round 4 of PR #593). All rows are synthetic. The final exception rolls
-- everything back, so a run that reaches the end reports PROBE_OK and leaves nothing. Run it with the Supabase MCP `execute_sql`;
-- see docs/parent-dashboard.md. No provider calls.
do $$
declare
  p uuid := gen_random_uuid(); child uuid := gen_random_uuid();
  card uuid; customer text := 'cus_probe_' || replace(p::text, '-', '');
  j jsonb; b boolean; n integer; r record; s public.plan_starts;
begin
  insert into auth.users(id, email) values (p, p::text || '@example.invalid');
  insert into public.parents(id, name, email, postal) values (p, 'Probe parent', p::text || '@example.invalid', 'V6B 1A1');
  insert into public.children(id, parent_id, first_name, grade, province) values (child, p, 'Probe A', 3, 'BC');
  insert into public.card_setups(parent_id, child_id, plan, price, stripe_customer_id, workbook_welcome_enabled)
    values (p, child, 'one', 79.99, customer, false) returning id into card;

  set local role service_role;

  -- The first admission opens generation 1, and makes the card row with no card.
  j := public.admit_plan_start(card, 1, 'key-a', 'pm_a');
  if not (j->>'admitted')::boolean or (j->>'generation')::int <> 1 or j->>'key' <> 'key-a' or j->>'state' <> 'open' or j->>'at' is null then raise exception 'first admission answered %', j; end if;

  -- A second press of the same generation gets the first key and card, and changes nothing.
  j := public.admit_plan_start(card, 1, 'key-b', 'pm_b');
  if (j->>'admitted')::boolean or j->>'key' <> 'key-a' or j->>'card' <> 'pm_a' then raise exception 'second admission answered %', j; end if;
  select count(*) into n from public.plan_starts where card_setup_id = card;
  if n <> 1 then raise exception 'two admissions left % rows', n; end if;

  -- A generation cannot open beside an open one.
  j := public.admit_plan_start(card, 2, 'key-c', 'pm_c');
  if (j->>'admitted')::boolean or (j->>'generation')::int <> 1 then raise exception 'a new generation opened beside an open one: %', j; end if;

  -- An open record is due, and reads with the row.
  select * into r from public.card_check_rows(p_card => card);
  if r.start_generation <> 1 or r.start_key <> 'key-a' or r.start_state <> 'open' or r.start_email <> 'none' then raise exception 'the row read %', r; end if;
  select count(*) into n from public.card_check_rows(p_changed_after => now() + interval '1 day') x where x.card_id = card;
  if n <> 1 then raise exception 'an open start read % due rows', n; end if;

  -- Time closes nothing, and the alert and the team's end wait for 24 hours.
  b := public.claim_plan_start_alert(card, 1);
  if b then raise exception 'the alert was claimed before 24 hours'; end if;
  b := public.team_end_plan_start(card, 1, p);
  if b then raise exception 'the team closed a start before 24 hours'; end if;

  -- The delayed second admission: the first press finishes, then the second press's admission finds it finished.
  b := public.finish_plan_start(card, 1, 'started', 'sub_1', now() + interval '30 days', true);
  if not b then raise exception 'finish did not close the record'; end if;
  j := public.admit_plan_start(card, 1, 'key-d', 'pm_d');
  if (j->>'admitted')::boolean or j->>'state' <> 'started' or j->>'subscription' <> 'sub_1' or j->>'email' <> 'pending' then raise exception 'the delayed admission answered %', j; end if;

  -- A closed record stays as it was: it is not cleared, and a second finish changes nothing.
  b := public.finish_plan_start(card, 1, 'refused', null, null, false);
  if b then raise exception 'a second finish closed the record again'; end if;
  select * into s from public.plan_starts where card_setup_id = card and generation = 1;
  if s.state <> 'started' or s.start_key <> 'key-a' or s.finished_at is null then raise exception 'the finished record changed'; end if;

  -- The email stays due while it is pending, and sent is final.
  select count(*) into n from public.card_check_rows(p_changed_after => now() + interval '1 day') x where x.card_id = card;
  if n <> 1 then raise exception 'a pending email read % due rows', n; end if;
  b := public.note_plan_start_email(card, 1, 'sent');
  if not b then raise exception 'the email was not noted'; end if;
  b := public.note_plan_start_email(card, 1, 'unknown');
  if b then raise exception 'a final email state moved'; end if;
  select count(*) into n from public.card_check_rows(p_changed_after => now() + interval '1 day') x where x.card_id = card;
  if n <> 0 then raise exception 'a finished start read % due rows', n; end if;

  -- A new generation opens only by asking for the next one, with a new key.
  j := public.admit_plan_start(card, 2, 'key-e', 'pm_e');
  if not (j->>'admitted')::boolean or (j->>'generation')::int <> 2 or j->>'key' <> 'key-e' then raise exception 'the next generation answered %', j; end if;

  -- A gap in the generations is refused.
  begin
    j := public.admit_plan_start(card, 9, 'key-f', 'pm_f');
    if (j->>'admitted')::boolean then raise exception 'a gap opened a generation'; end if;
  end;

  -- One key per generation and card setup: a key cannot come back.
  b := public.finish_plan_start(card, 2, 'refused', null, null, false);
  begin
    j := public.admit_plan_start(card, 3, 'key-a', 'pm_a');
    raise exception 'an old key came back';
  exception when unique_violation then null;
  end;

  -- The service role has no direct write.
  begin
    update public.plan_starts set state = 'refused' where card_setup_id = card;
    raise exception 'the service role updated directly';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- A record 24 hours old: one alert claim at a time, released goes back, sent stays, and the team's end closes it.
  update public.plan_starts set started_at = now() - interval '25 hours', state = 'open', finished_at = null, email_state = 'none' where card_setup_id = card and generation = 2;
  set local role service_role;
  b := public.claim_plan_start_alert(card, 2);
  if not b then raise exception 'the alert was not claimed'; end if;
  b := public.claim_plan_start_alert(card, 2);
  if b then raise exception 'the alert was claimed twice'; end if;
  b := public.note_plan_start_alert(card, 2, 'released', null, 'Resend answered 429');
  b := public.claim_plan_start_alert(card, 2);
  if not b then raise exception 'a released alert could not be claimed again'; end if;
  b := public.note_plan_start_alert(card, 2, 'sent', 'email-1', null);
  b := public.claim_plan_start_alert(card, 2);
  if b then raise exception 'a sent alert was claimed again'; end if;
  select count(*) into n from public.card_check_rows(p_changed_after => now() + interval '1 day') x where x.card_id = card;
  if n <> 1 then raise exception 'an old open start read % due rows', n; end if;
  b := public.team_end_plan_start(card, 1, p);
  if b then raise exception 'the team closed a finished start'; end if;
  b := public.team_end_plan_start(card, 2, p);
  if not b then raise exception 'the team did not close the old start'; end if;
  select * into s from public.plan_starts where card_setup_id = card and generation = 2;
  if s.state <> 'team_ended' or s.ended_by <> p then raise exception 'the team end wrote %', s; end if;
  reset role;

  -- The owner and anon read nothing and call nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.plan_starts;
  if n <> 0 then raise exception 'the owner read % rows', n; end if;
  begin perform public.admit_plan_start(card, 4, 'k', 'pm'); raise exception 'a parent called admit_plan_start'; exception when insufficient_privilege then null; end;
  begin perform public.finish_plan_start(card, 1, 'other', 's', null, false); raise exception 'a parent called finish_plan_start'; exception when insufficient_privilege then null; end;
  begin perform public.note_plan_start_email(card, 1, 'sent'); raise exception 'a parent called note_plan_start_email'; exception when insufficient_privilege then null; end;
  begin perform public.claim_plan_start_alert(card, 1); raise exception 'a parent called claim_plan_start_alert'; exception when insufficient_privilege then null; end;
  begin perform public.note_plan_start_alert(card, 1, 'sent', null, null); raise exception 'a parent called note_plan_start_alert'; exception when insufficient_privilege then null; end;
  begin perform public.team_end_plan_start(card, 1, p); raise exception 'a parent called team_end_plan_start'; exception when insufficient_privilege then null; end;
  begin perform * from public.card_check_rows(p_card => card); raise exception 'a parent called card_check_rows'; exception when insufficient_privilege then null; end;
  reset role;
  set local role anon;
  begin perform public.admit_plan_start(card, 4, 'k', 'pm'); raise exception 'anon called admit_plan_start'; exception when insufficient_privilege then null; end;
  begin perform public.team_end_plan_start(card, 1, p); raise exception 'anon called team_end_plan_start'; exception when insufficient_privilege then null; end;
  begin perform * from public.card_check_rows(p_card => card); raise exception 'anon called card_check_rows'; exception when insufficient_privilege then null; end;
  reset role;

  -- The fence refuses a write for a family being deleted, and a deletion removes the records.
  update public.parents set deletion_requested_at = now() where id = p;
  begin
    set local role service_role;
    perform public.admit_plan_start(card, 3, 'key-z', 'pm_z');
    raise exception 'the fence let an admission through';
  exception when sqlstate '55000' then null;
  end;
  reset role;
  select count(*) into n from public.plan_starts where card_setup_id = card;
  if n <> 2 then raise exception 'the fence test left % rows', n; end if;

  raise exception 'PROBE_OK';
end $$;
