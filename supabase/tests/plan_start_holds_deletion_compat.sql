-- Synthetic rows only. No deletion or provider call runs. PROBE_OK rolls back every insert and update.
do $$
declare
  p uuid := gen_random_uuid(); c uuid := gen_random_uuid(); a uuid := gen_random_uuid(); card uuid;
  token uuid := gen_random_uuid(); hold uuid := gen_random_uuid(); j jsonb; answer text; n integer;
begin
  insert into auth.users(id, email) values (p, p::text || '@example.invalid'), (a, a::text || '@example.invalid');
  insert into public.parents(id, name, email, postal) values (p, 'PR593 synthetic probe', p::text || '@example.invalid', 'V6B 1A1');
  insert into public.admin_users(user_id, email, name) values (a, a::text || '@example.invalid', 'Synthetic admin');
  insert into public.children(id, parent_id, first_name, grade, province) values (c, p, 'Probe', 3, 'BC');
  insert into public.card_setups(parent_id, child_id, plan, price, stripe_customer_id, card_saved_at, workbook_welcome_enabled)
    values (p, c, 'one', 79.99, 'cus_probe_' || p::text, now(), false) returning id into card;

  -- A family that has never reached a start remains ready.
  if public.check_parent_family_deletion(p) <> 'ready' then raise exception 'no-start family blocked'; end if;
  j := public.admit_plan_start(card, 1, 'probe-' || p::text, 'pm_probe');
  if not (j->>'admitted')::boolean then raise exception 'not admitted'; end if;

  -- The real start route releases this hold after an unconfirmed return. The open record remains binding.
  perform public.begin_family_card_operation(p, token);
  perform public.end_family_card_operation(token);
  if public.check_parent_family_deletion(p) <> 'plan_start' then raise exception 'check missed open start'; end if;
  if public.begin_family_delete_hold(p, hold) <> 'plan_start' then raise exception 'hold missed open start'; end if;
  if public.request_parent_family_deletion(p, true) <> 'plan_start' then raise exception 'old check missed open start'; end if;
  if public.request_parent_family_deletion(p, false) <> 'plan_start' then raise exception 'old request missed open start'; end if;
  insert into public.family_delete_holds(parent_id, lease_token, lease_until) values (p, hold, now() + interval '5 minutes');
  if public.request_parent_family_deletion_held(p, hold) <> 'plan_start' then raise exception 'held request missed open start'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  if public.request_family_deletion(p, p::text || '@example.invalid') <> 'plan_start' then raise exception 'admin request missed open start'; end if;
  if exists(select 1 from public.family_deletions where parent_id = p)
    or exists(select 1 from public.parents where id = p and deletion_requested_at is not null) then raise exception 'a refusal changed the family'; end if;

  -- A queued worker must refuse the record even when an older worker already set the phase to deleting.
  insert into public.family_deletions(parent_id, reason, phase) values (p, 'request', 'checking');
  if public.claim_family_deletion(p, token)->>'state' <> 'plan_start' then raise exception 'checking claim missed open start'; end if;
  update public.family_deletions set phase = 'deleting' where parent_id = p;
  if public.claim_family_deletion(p, token)->>'state' <> 'plan_start' then raise exception 'deleting claim missed open start'; end if;
  if public.claim_family_retention(p, token, now() - interval '1 year')->>'state' <> 'plan_start' then raise exception 'retention claim missed open start'; end if;
  perform public.end_family_delete_hold(p, hold);

  -- A resolved record permits deletion again. Nothing invokes the deletion worker here.
  if not public.finish_plan_start(card, 1, 'started', 'sub_probe_1', now() + interval '30 days', true) then raise exception 'finish failed'; end if;
  if public.check_parent_family_deletion(p) <> 'ready' then raise exception 'resolved start still blocks deletion'; end if;

  -- Two generations have independent claims. An unsent claim returns without consuming an attempt.
  if not public.claim_plan_start_email(card, 1, token, '{"to":"probe@example.invalid","subject":"Probe","text":"Probe"}') then raise exception 'generation one not claimed'; end if;
  if not public.release_plan_start_email(card, 1, token) then raise exception 'claim not released'; end if;
  select email_attempts into n from public.plan_starts where card_setup_id = card and generation = 1;
  if n <> 0 then raise exception 'unsent claim used an attempt'; end if;
  if not public.claim_plan_start_email(card, 1, token, '{}') then raise exception 'released claim unavailable'; end if;
  if not public.note_plan_start_email_send(card, 1, token, 'sent', 'probe-email-1', null) then raise exception 'first send not noted'; end if;
  if public.claim_plan_start_email(card, 1, token, '{}') then raise exception 'first send claimed twice'; end if;
  j := public.admit_plan_start(card, 2, 'probe-two-' || p::text, 'pm_probe');
  if not (j->>'admitted')::boolean then raise exception 'second generation not admitted'; end if;
  if not public.finish_plan_start(card, 2, 'started', 'sub_probe_2', now() + interval '30 days', true) then raise exception 'second finish failed'; end if;
  if not public.claim_plan_start_email(card, 2, token, '{}') then raise exception 'second generation suppressed'; end if;
  if not public.note_plan_start_email_send(card, 2, token, 'failed', null, 'probe refusal') then raise exception 'refusal not noted'; end if;
  if not public.claim_plan_start_email(card, 2, token, '{}') then raise exception 'refused send not retried'; end if;
  if not public.note_plan_start_email_send(card, 2, token, 'unknown', null, 'probe timeout') then raise exception 'unknown not noted'; end if;
  if public.claim_plan_start_email(card, 2, token, '{}') then raise exception 'unknown send retried'; end if;

  -- An old workbook ledger row reads as generation zero and protects generation one during deployment.
  update public.plan_starts set email_send_status = null where card_setup_id = card and generation = 1;
  insert into public.workbook_emails(card_setup_id, parent_id, child_id, kind, workbook_number, status)
    values (card, p, c, 'plan_start', 0, 'sent');
  if public.claim_plan_start_email(card, 1, token, '{}') then raise exception 'legacy sent email claimed again'; end if;

  -- Team closure also removes the block.
  j := public.admit_plan_start(card, 3, 'probe-three-' || p::text, 'pm_probe');
  update public.plan_starts set started_at = now() - interval '25 hours' where card_setup_id = card and generation = 3;
  if not public.team_end_plan_start(card, 3, a) then raise exception 'team closure failed'; end if;
  if public.check_parent_family_deletion(p) <> 'ready' then raise exception 'team closure still blocks deletion'; end if;

  -- New service functions are unavailable to parent and anonymous roles.
  if has_function_privilege('authenticated', 'public.claim_plan_start_email(uuid,integer,uuid,jsonb)', 'execute')
    or has_function_privilege('anon', 'public.claim_plan_start_email(uuid,integer,uuid,jsonb)', 'execute')
    or has_function_privilege('authenticated', 'public.release_plan_start_email(uuid,integer,uuid)', 'execute')
    or has_function_privilege('anon', 'public.note_plan_start_email_send(uuid,integer,uuid,text,text,text)', 'execute') then raise exception 'email claim permissions too broad'; end if;
  raise exception 'PROBE_OK';
end $$;
