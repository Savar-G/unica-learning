-- Synthetic rows only. The final exception rolls back every insert and update. No deletion runs.
do $$
declare
  p uuid; c uuid; a uuid := gen_random_uuid(); card uuid; token uuid := gen_random_uuid();
  i integer; r record; n integer; j jsonb;
begin
  insert into auth.users(id, email) values (a, a::text || '@example.invalid');
  insert into public.admin_users(user_id, email, name) values (a, a::text || '@example.invalid', 'Recovery probe admin');
  for i in 1..2 loop
    p := gen_random_uuid(); c := gen_random_uuid();
    insert into auth.users(id, email) values (p, p::text || '@example.invalid');
    insert into public.parents(id, name, email, postal) values (p, 'PR593 recovery probe', p::text || '@example.invalid', 'V6B 1A1');
    insert into public.children(id, parent_id, first_name, grade, province) values (c, p, 'Probe', 3, 'BC');
    insert into public.card_setups(parent_id, child_id, plan, price, stripe_customer_id, card_saved_at, workbook_welcome_enabled)
      values (p, c, 'one', 79.99, 'cus_recovery_' || p::text, now(), false) returning id into card;
    perform public.admit_plan_start(card, 1, 'recovery-' || p::text, 'pm_probe');
    update public.plan_starts set started_at = now() - interval '25 hours' where card_setup_id = card;
    begin
      perform public.finish_plan_start(card, 1, 'other', 'sub_unrelated', null, false);
      raise exception 'unrelated subscription closed a request before the fence';
    exception when sqlstate '55000' then null; end;
    -- Reproduce the previous version's queued family, without invoking deletion.
    update public.parents set deletion_requested_at = now() where id = p;
    insert into public.family_deletions(parent_id, reason, phase) values (p, 'request', case when i = 1 then 'checking' else 'deleting' end);
    if public.claim_family_deletion(p, token)->>'state' <> 'plan_start' then raise exception 'open start admitted deletion'; end if;
    begin
      perform public.finish_plan_start(card, 1, 'other', 'sub_unrelated', null, false);
      raise exception 'unrelated subscription closed a fenced request';
    exception when sqlstate '55000' then null; end;
    if public.claim_family_deletion(p, token)->>'state' <> 'plan_start' then raise exception 'unrelated subscription removed deletion guard'; end if;
    select * into r from public.card_recovery_rows(p_card => card);
    if r.card_id is distinct from card or r.deletion_queued is distinct from true then raise exception 'queued start hidden'; end if;
    select count(*) into n from public.card_check_rows(p_card => card);
    if n <> 0 then raise exception 'old reader can reach fenced family'; end if;

    -- The only permitted fenced writes are the existing open record's resolution and team alert.
    if not public.claim_plan_start_alert(card, 1) then raise exception 'alert blocked'; end if;
    if not public.note_plan_start_alert(card, 1, 'sent', 'probe', null) then raise exception 'alert note blocked'; end if;
    begin
      perform public.record_card_update(p, card, 'cs_probe', now(), 'pm_other');
      raise exception 'card write passed fence';
    exception when sqlstate '55000' then null; end;
    begin
      perform public.note_card_checked(card);
      raise exception 'sweep note passed fence';
    exception when sqlstate '55000' then null; end;
    begin
      update public.children set first_name = 'Changed' where id = c;
      raise exception 'child write passed fence';
    exception when sqlstate '55000' then null; end;
    begin
      update public.plan_starts set payment_method_id = 'pm_other' where card_setup_id = card;
      raise exception 'start card write passed fence';
    exception when sqlstate '55000' then null; end;
    begin
      update public.plan_starts set email_to = 'changed@example.invalid' where card_setup_id = card;
      raise exception 'email write passed fence';
    exception when sqlstate '55000' then null; end;
    begin
      perform public.admit_plan_start(card, 2, 'new-' || p::text, 'pm_other');
      raise exception 'new admission passed fence';
    exception when sqlstate '55000' then null; end;

    if i = 1 then
      if not public.finish_plan_start(card, 1, 'started', 'sub_probe', now() + interval '30 days', true) then raise exception 'resolution blocked'; end if;
      if exists(select 1 from public.plan_starts where card_setup_id = card and email_state <> 'none') then raise exception 'parent email queued'; end if;
    else
      if not public.team_end_plan_start(card, 1, a) then raise exception 'team close blocked'; end if;
    end if;
    select count(*) into n from public.card_recovery_rows(p_card => card);
    if n <> 0 then raise exception 'closed fenced start still due'; end if;
    select count(*) into n from public.family_deletion_start_customers(p);
    if n <> 1 then raise exception 'worker cannot find recovered customer'; end if;
    j := public.claim_family_deletion(p, token);
    if j->>'state' <> 'ready' then raise exception 'resolved deletion blocked: %', j; end if;
    if j->>'phase' <> (case when i = 1 then 'checking' else 'deleting' end) then raise exception 'worker phase changed'; end if;
    begin
      update public.plan_starts set team_alert_error = 'closed write' where card_setup_id = card;
      raise exception 'closed record write passed fence';
    exception when sqlstate '55000' then null; end;
  end loop;
  if has_function_privilege('authenticated', 'public.card_recovery_rows(uuid,text,timestamptz,integer)', 'execute')
    or has_function_privilege('anon', 'public.card_recovery_rows(uuid,text,timestamptz,integer)', 'execute')
    or has_function_privilege('authenticated', 'public.family_deletion_start_customers(uuid)', 'execute')
    or has_function_privilege('anon', 'public.family_deletion_start_customers(uuid)', 'execute') then raise exception 'recovery permissions too broad'; end if;
  raise exception 'PROBE_OK';
end $$;
