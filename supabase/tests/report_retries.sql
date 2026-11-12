-- Hosted probe for the report retries' rule (#771; migrations report_retries and report_retry_send_check). Every row is
-- synthetic and made inside this block, and the final exception rolls it all back, so a run that reaches the end
-- reports PROBE_OK and leaves nothing. It removes no row of any family, sends nothing and makes no provider call. Run it
-- with the Management API (`supabase db query --linked`), as postgres. Two claims of the same test in one session are
-- covered here; two claims in two sessions at once are in report_retries.cjs, on a disposable local PostgreSQL.
--
-- The functions read the database's clock, and no caller can move it, so each test's age is set by its completed_at,
-- and a move of the clock between a claim and its send is made by moving that test's completed_at back.
do $$
declare
  real_p uuid := gen_random_uuid(); test_p uuid := gen_random_uuid(); team_p uuid := gen_random_uuid(); gone_p uuid := gen_random_uuid();
  ids uuid[]; c uuid; a_send uuid; a_old uuid; a_old_released uuid; a_test uuid; a_team uuid; a_new uuid; a_gone uuid; a_sent uuid; a_cross uuid;
  t timestamptz := clock_timestamp();
  r record; n integer; v text; ok boolean; gave timestamptz;
  ages constant integer[] := array[600, 172800];
  delays constant integer[] := array[900, 1800, 3600, 900];
begin
  insert into auth.users(id, email) select id, id::text || '@example.invalid' from unnest(array[real_p, test_p, team_p, gone_p]) id;
  insert into public.parents(id, name, email, postal) select id, 'Probe parent', id::text || '@example.invalid', 'V6B 1A1' from unnest(array[real_p, test_p, team_p, gone_p]) id;
  insert into public.admin_users(user_id, email, name) values (team_p, team_p::text || '@example.invalid', 'Probe team');
  insert into public.test_accounts(parent_id, marked_by) values (test_p, team_p);

  -- One child and one completed test per case. completed_at sets the age by the database's clock.
  create temp table probe_tests(name text primary key, id uuid, parent uuid, age interval, report text) on commit drop;
  insert into probe_tests values
    ('send', gen_random_uuid(), real_p, interval '47 hours 59 minutes', null),
    ('old', gen_random_uuid(), real_p, interval '48 hours 1 minute', null),
    ('old_released', gen_random_uuid(), real_p, interval '48 hours 1 minute', 'released'),
    ('test_family', gen_random_uuid(), test_p, interval '30 minutes', null),
    ('team', gen_random_uuid(), team_p, interval '30 minutes', null),
    ('new', gen_random_uuid(), real_p, interval '9 minutes', null),
    ('gone', gen_random_uuid(), gone_p, interval '30 minutes', null),
    ('sent', gen_random_uuid(), real_p, interval '30 minutes', 'sent'),
    ('cross', gen_random_uuid(), real_p, interval '47 hours 59 minutes', 'released');
  for r in select * from probe_tests loop
    c := gen_random_uuid();
    insert into public.children(id, parent_id, first_name, grade, province) values (c, r.parent, 'Probe', 3, 'BC');
    insert into public.assessments(id, parent_id, child_id, grade, province, seed, test, status, completed_at, placement)
      values (r.id, r.parent, c, 3, 'BC', 1, '{}'::jsonb, 'completed', t - r.age, '{}'::jsonb);
    if r.report is not null then
      insert into public.reports(assessment_id, parent_id, child_id, model, questions, minutes, emailed_at, email_id, email_error)
        values (r.id, r.parent, c, '{}'::jsonb, 10, 10,
          case when r.report = 'sent' then t end, case when r.report = 'sent' then 'email-probe' end,
          case when r.report = 'released' then 'Resend answered 422 in the probe' end);
    end if;
  end loop;
  select id into a_send from probe_tests where name = 'send';
  select id into a_old from probe_tests where name = 'old';
  select id into a_old_released from probe_tests where name = 'old_released';
  select id into a_test from probe_tests where name = 'test_family';
  select id into a_team from probe_tests where name = 'team';
  select id into a_new from probe_tests where name = 'new';
  select id into a_gone from probe_tests where name = 'gone';
  select id into a_sent from probe_tests where name = 'sent';
  select id into a_cross from probe_tests where name = 'cross';
  -- The family being deleted asks for it after its test is written (the fence refuses writes after).
  update public.parents set deletion_requested_at = t where id = gone_p;

  -- What each test needs, now.
  for r in select name, id, public.report_retry_need(id, clock_timestamp(), ages[1], ages[2]) need from probe_tests loop
    v := coalesce(r.need, 'none');
    if v <> (case r.name when 'send' then 'send' when 'old' then 'build' when 'test_family' then 'build' when 'team' then 'build'
                         when 'cross' then 'send' else 'none' end) then
      raise exception 'need of %: %', r.name, v;
    end if;
  end loop;

  -- The due list: the tests with a need, oldest place first; never the 9-minute test or the family being deleted.
  select array_agg(out_assessment order by ord) into ids
    from (select out_assessment, row_number() over () ord from public.report_retries_due(100, ages[1], ages[2])) d
    where out_assessment in (select id from probe_tests);
  -- Tests that finished at the same time are in id order, so each such pair is compared as a set.
  if cardinality(ids) <> 5 or ids[1] <> a_old or not (ids[2:3] @> array[a_send, a_cross]) or not (ids[4:5] @> array[a_test, a_team]) then
    raise exception 'due list: %', ids;
  end if;

  -- Claims: send at 47 h 59 min; build only at 48 h 1 min, for a test family and for a team account; nothing for a
  -- 9-minute test, a family being deleted, a report whose email went, or a released email older than 48 hours.
  select out_attempt, out_email::text into n, v from public.claim_report_retry(a_send, ages[1], ages[2], 4, delays);
  if n is distinct from 1 or v <> 'true' then raise exception 'claim send: % %', n, v; end if;
  for r in select x.id, x.name from probe_tests x where x.name in ('old', 'test_family', 'team') loop
    select out_attempt, out_email::text into n, v from public.claim_report_retry(r.id, ages[1], ages[2], 4, delays);
    if n is distinct from 1 or v <> 'false' then raise exception 'claim % : % %', r.name, n, v; end if;
  end loop;
  for r in select x.id, x.name from probe_tests x where x.name in ('new', 'gone', 'sent', 'old_released') loop
    select count(*) into n from public.claim_report_retry(r.id, ages[1], ages[2], 4, delays);
    if n <> 0 then raise exception 'claimed % that needs nothing', r.name; end if;
    if exists (select 1 from public.report_retries where assessment_id = r.id) then raise exception 'row written for %', r.name; end if;
  end loop;

  -- Two claims of the same test: the second, before the delay, gets nothing, and the count stays 1.
  select count(*) into n from public.claim_report_retry(a_send, ages[1], ages[2], 4, delays);
  if n <> 0 then raise exception 'second claim taken'; end if;
  select attempts into n from public.report_retries where assessment_id = a_send;
  if n <> 1 then raise exception 'attempts after two claims: %', n; end if;
  if (select next_at from public.report_retries where assessment_id = a_send) < t + interval '14 minutes' then raise exception 'delay of retry 1'; end if;

  -- The bound: once each delay has passed, retries 2 to 4 go, the fifth does not; the give-up is claimed once.
  for i in 2..4 loop
    update public.report_retries set next_at = clock_timestamp() - interval '1 second' where assessment_id = a_old;
    select out_attempt into n from public.claim_report_retry(a_old, ages[1], ages[2], 4, delays);
    if n is distinct from i then raise exception 'retry %: %', i, n; end if;
  end loop;
  update public.report_retries set next_at = clock_timestamp() - interval '1 second' where assessment_id = a_old;
  select count(*) into n from public.claim_report_retry(a_old, ages[1], ages[2], 4, delays);
  if n <> 0 then raise exception 'a fifth retry'; end if;
  gave := public.claim_report_give_up(a_old, ages[1], ages[2], 4);
  if gave is null then raise exception 'no give-up'; end if;
  if public.claim_report_give_up(a_old, ages[1], ages[2], 4) is not null then raise exception 'second give-up'; end if;
  if public.claim_report_give_up(a_send, ages[1], ages[2], 4) is not null then raise exception 'give-up before the bound'; end if;

  -- The send-time check: yes inside 48 hours; no for an old test, a test family, a team account, a 9-minute test, a
  -- family being deleted, and a report whose email went.
  if not public.report_retry_may_email(a_send, ages[1], ages[2]) then raise exception 'may_email send'; end if;
  for r in select x.id, x.name from probe_tests x where x.name in ('old', 'test_family', 'team', 'new', 'gone', 'sent', 'old_released') loop
    if public.report_retry_may_email(r.id, ages[1], ages[2]) then raise exception 'may_email %', r.name; end if;
  end loop;
  -- A retry claimed at 47 h 59 min whose job reaches the send after 48 hours: the claim said email, the send says no.
  select out_email into ok from public.claim_report_retry(a_cross, ages[1], ages[2], 4, delays);
  if ok is distinct from true then raise exception 'cross claim: %', ok; end if;
  update public.assessments set completed_at = completed_at - interval '2 minutes' where id = a_cross;
  if public.report_retry_may_email(a_cross, ages[1], ages[2]) then raise exception 'may_email after 48 hours'; end if;

  -- Who may call what.
  if has_function_privilege('anon', 'public.report_retries_due(integer, integer, integer)', 'execute')
    or has_function_privilege('authenticated', 'public.claim_report_retry(uuid, integer, integer, integer, integer[])', 'execute')
    or has_function_privilege('authenticated', 'public.report_retry_may_email(uuid, integer, integer)', 'execute')
    or has_function_privilege('service_role', 'public.report_retry_need(uuid, timestamptz, integer, integer)', 'execute')
    or not has_function_privilege('service_role', 'public.report_retry_may_email(uuid, integer, integer)', 'execute')
    or not has_function_privilege('service_role', 'public.claim_report_give_up(uuid, integer, integer, integer)', 'execute')
    or has_table_privilege('authenticated', 'public.report_retries', 'select')
    or has_table_privilege('service_role', 'public.report_retries', 'insert') then
    raise exception 'grants';
  end if;

  raise exception 'PROBE_OK';
end $$;
