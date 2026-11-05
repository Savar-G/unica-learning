-- Hosted probe for migration plan_start_holds_deletion (#554, review round 5 of PR #593). All rows are synthetic. The final exception
-- rolls everything back, so a run that reaches the end reports PROBE_OK and leaves nothing. It runs no deletion: it asks for one only
-- for its own synthetic family, inside this transaction. Run it with the Supabase MCP `execute_sql`. No provider calls.
do $$
declare
  p uuid := gen_random_uuid(); child uuid := gen_random_uuid(); admin uuid := gen_random_uuid();
  other uuid := gen_random_uuid();
  mail text := p::text || '@example.invalid';
  card uuid; customer text := 'cus_probe_' || replace(p::text, '-', '');
  hold uuid := gen_random_uuid(); token uuid := gen_random_uuid(); token2 uuid := gen_random_uuid();
  j jsonb; b boolean; t text; n integer; s public.plan_starts;
begin
  insert into auth.users(id, email) values (p, mail), (admin, admin::text || '@example.invalid'), (other, other::text || '@example.invalid');
  insert into public.parents(id, name, email, postal) values (p, 'Probe parent', mail, 'V6B 1A1'), (other, 'Probe other', other::text || '@example.invalid', 'V6B 1A1');
  insert into public.children(id, parent_id, first_name, grade, province) values (child, p, 'Probe A', 3, 'BC');
  insert into public.card_setups(parent_id, child_id, plan, price, stripe_customer_id, workbook_welcome_enabled)
    values (p, child, 'one', 79.99, customer, false) returning id into card;
  insert into public.admin_users(user_id, email, name) values (admin, admin::text || '@example.invalid', 'Probe admin');

  set local role service_role;

  -- A family that never reached a start answers as before.
  t := public.check_parent_family_deletion(other);
  if t <> 'ready' then raise exception 'a family with no start checked %', t; end if;
  t := public.request_parent_family_deletion(other, true);
  if t <> 'ready' then raise exception 'a family with no start check_only answered %', t; end if;

  -- The deletion's hold, taken before the record opens, so the request below meets the record under a live hold.
  t := public.begin_family_delete_hold(p, hold);
  if t <> 'held' then raise exception 'the first hold answered %', t; end if;
  perform public.end_family_delete_hold(p, hold);

  -- An open record: the state after startPlan answered unconfirmed and the route let go of the card hold.
  j := public.admit_plan_start(card, 1, 'key-a', 'pm_a');
  if not (j->>'admitted')::boolean then raise exception 'the admission answered %', j; end if;

  -- Every self-serve step refuses, and writes nothing.
  t := public.check_parent_family_deletion(p);
  if t <> 'plan_start' then raise exception 'the check answered %', t; end if;
  t := public.begin_family_delete_hold(p, hold);
  if t <> 'plan_start' then raise exception 'the hold answered %', t; end if;
  t := public.request_parent_family_deletion(p, true);
  if t <> 'plan_start' then raise exception 'the check_only request answered %', t; end if;
  t := public.request_parent_family_deletion(p);
  if t <> 'plan_start' then raise exception 'the old request answered %', t; end if;
  reset role;
  update public.family_delete_holds set lease_token = hold, lease_until = clock_timestamp() + interval '5 minutes' where parent_id = p;
  set local role service_role;
  t := public.request_parent_family_deletion_held(p, hold);
  if t <> 'plan_start' then raise exception 'the held request answered %', t; end if;
  perform public.end_family_delete_hold(p, hold);
  -- A card hold still answers busy first.
  perform public.begin_family_card_operation(p, card);
  t := public.check_parent_family_deletion(p);
  if t <> 'busy' then raise exception 'a card hold checked %', t; end if;
  perform public.end_family_card_operation(card);
  reset role;

  -- The admin's request refuses.
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  t := public.request_family_deletion(p, mail);
  if t <> 'plan_start' then raise exception 'the admin request answered %', t; end if;
  reset role;

  -- The worker's claims keep the family, and freeze nothing.
  set local role service_role;
  j := public.claim_family_retention(p, token, now() - interval '7 months');
  if j->>'state' <> 'plan_start' then raise exception 'the former customer claim answered %', j; end if;
  reset role;
  -- A free-test family has no saved card: this one, with a test older than 12 months, is due by that rule.
  insert into public.assessments(parent_id, child_id, seed, started_at, grade, province, test)
    values (p, child, 1, now() - interval '2 years', 3, 'BC', '{}'::jsonb);
  set local role service_role;
  j := public.claim_family_deletion(p, token);
  if j->>'state' <> 'plan_start' then raise exception 'the free-test claim answered %', j; end if;
  reset role;
  select count(*) into n from public.family_deletions where parent_id = p;
  if n <> 0 then raise exception 'a refusal queued % rows', n; end if;
  if (select deletion_requested_at from public.parents where id = p) is not null then raise exception 'a refusal fenced the family'; end if;

  -- A job in checking keeps the family, and a job in deleting goes on. Each is undone at once.
  begin
    insert into public.family_deletions(parent_id, reason) values (p, 'retention');
    set local role service_role;
    j := public.claim_family_deletion(p, token);
    if j->>'state' <> 'plan_start' then raise exception 'a checking job claimed %', j; end if;
    reset role;
    update public.family_deletions set phase = 'deleting' where parent_id = p;
    set local role service_role;
    j := public.claim_family_deletion(p, token);
    if j->>'state' <> 'ready' or j->>'phase' <> 'deleting' then raise exception 'a deleting job claimed %', j; end if;
    reset role;
    raise exception 'PROBE_UNDO';
  exception when raise_exception then
    if sqlerrm <> 'PROBE_UNDO' then raise; end if;
  end;

  -- A record that resolves opens the deletion again.
  set local role service_role;
  b := public.finish_plan_start(card, 1, 'started', 'sub_1', now() + interval '30 days', true);
  if not b then raise exception 'finish did not close the record'; end if;
  t := public.check_parent_family_deletion(p);
  if t <> 'ready' then raise exception 'a resolved record checked %', t; end if;

  -- The email's ledger: one claim per generation, and a claim given back may be taken again.
  b := public.claim_plan_start_email(card, 9, token, '{}'::jsonb);
  if b then raise exception 'a claim on no record answered true'; end if;
  b := public.claim_plan_start_email(card, 1, token, '{"to":"a@example.invalid","subject":"S","text":"T"}'::jsonb);
  if not b then raise exception 'the first claim was refused'; end if;
  b := public.claim_plan_start_email(card, 1, token2, '{}'::jsonb);
  if b then raise exception 'a second claim was given while one is held'; end if;
  select * into s from public.plan_starts where card_setup_id = card and generation = 1;
  if s.email_send_status <> 'sending' or s.email_attempts <> 1 or s.email_subject <> 'S' then raise exception 'the claim wrote %', s; end if;
  b := public.release_plan_start_email(card, 1, token2);
  if b then raise exception 'another token released the claim'; end if;
  b := public.release_plan_start_email(card, 1, token);
  if not b then raise exception 'the release did nothing'; end if;
  select * into s from public.plan_starts where card_setup_id = card and generation = 1;
  if s.email_send_status is not null or s.email_attempts <> 0 or s.email_claim_token is not null then raise exception 'the release wrote %', s; end if;
  b := public.claim_plan_start_email(card, 1, token, '{"to":"a@example.invalid"}'::jsonb);
  if not b then raise exception 'a released claim was refused'; end if;
  b := public.note_plan_start_email_send(card, 1, token, 'failed', null, 'Refused');
  b := public.claim_plan_start_email(card, 1, token2, '{"to":"a@example.invalid"}'::jsonb);
  if not b then raise exception 'a refused send could not be claimed again'; end if;
  b := public.note_plan_start_email_send(card, 1, token2, 'sent', 'email-1', null);
  if not b then raise exception 'the outcome was not noted'; end if;
  b := public.claim_plan_start_email(card, 1, token, '{}'::jsonb);
  if b then raise exception 'a sent email was claimed again'; end if;
  b := public.note_plan_start_email(card, 1, 'sent');

  -- The next generation: open again refuses, then it has its own claim beside the first one's sent claim.
  j := public.admit_plan_start(card, 2, 'key-b', 'pm_b');
  t := public.check_parent_family_deletion(p);
  if t <> 'plan_start' then raise exception 'a second open record checked %', t; end if;
  b := public.claim_plan_start_email(card, 2, token, '{}'::jsonb);
  if b then raise exception 'an open record gave an email claim'; end if;
  b := public.finish_plan_start(card, 2, 'started', 'sub_2', now() + interval '30 days', true);
  b := public.claim_plan_start_email(card, 2, token, '{"to":"a@example.invalid"}'::jsonb);
  if not b then raise exception 'the second generation was refused its own claim'; end if;
  b := public.note_plan_start_email_send(card, 2, token, 'sent', 'email-2', null);
  select count(*) into n from public.plan_starts where card_setup_id = card and email_send_status = 'sent';
  if n <> 2 then raise exception 'two generations hold % sent claims', n; end if;

  -- An admin's close opens the deletion again too.
  j := public.admit_plan_start(card, 3, 'key-c', 'pm_c');
  t := public.check_parent_family_deletion(p);
  if t <> 'plan_start' then raise exception 'a third open record checked %', t; end if;
  reset role;
  update public.plan_starts set started_at = now() - interval '25 hours' where card_setup_id = card and generation = 3;
  set local role service_role;
  b := public.team_end_plan_start(card, 3, admin);
  if not b then raise exception 'the team did not close the record'; end if;
  t := public.check_parent_family_deletion(p);
  if t <> 'ready' then raise exception 'a closed record checked %', t; end if;

  -- With nothing open, the full self-serve request works, inside this rolled-back transaction.
  t := public.begin_family_delete_hold(p, hold);
  if t <> 'held' then raise exception 'the last hold answered %', t; end if;
  t := public.request_parent_family_deletion_held(p, hold);
  if t <> 'requested' then raise exception 'the last request answered %', t; end if;
  -- The fence covers the record, so its email's ledger cannot move for a family being removed.
  begin
    perform public.note_plan_start_email(card, 2, 'sent');
    raise exception 'the fence let a write of the record through';
  exception when sqlstate '55000' then null;
  end;
  reset role;

  -- A parent and anon call nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.claim_plan_start_email(card, 1, token, '{}'::jsonb); raise exception 'a parent called claim_plan_start_email'; exception when insufficient_privilege then null; end;
  begin perform public.note_plan_start_email_send(card, 1, token, 'sent', null, null); raise exception 'a parent called note_plan_start_email_send'; exception when insufficient_privilege then null; end;
  begin perform public.release_plan_start_email(card, 1, token); raise exception 'a parent called release_plan_start_email'; exception when insufficient_privilege then null; end;
  begin perform public.family_plan_start_open(p); raise exception 'a parent called family_plan_start_open'; exception when insufficient_privilege then null; end;
  select count(*) into n from public.plan_starts;
  if n <> 0 then raise exception 'a parent read % rows', n; end if;
  reset role;
  set local role anon;
  begin perform public.claim_plan_start_email(card, 1, token, '{}'::jsonb); raise exception 'anon called claim_plan_start_email'; exception when insufficient_privilege then null; end;
  begin perform public.family_plan_start_open(p); raise exception 'anon called family_plan_start_open'; exception when insufficient_privilege then null; end;
  reset role;

  raise exception 'PROBE_OK';
end $$;
