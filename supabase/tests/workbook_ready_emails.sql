-- Synthetic rows and claims only. No provider calls. Roll back all data.
begin;
do $$
declare p uuid := gen_random_uuid(); child uuid := gen_random_uuid(); card uuid := gen_random_uuid();
  n integer; first_token uuid; retry_token uuid; before_card jsonb;
  msg jsonb := '{"to":"probe@example.invalid","subject":"Ready probe","text":"Approved probe text","html":"<p>Approved probe text</p>"}';
  hand jsonb := '{"method":"hand"}';
begin
  insert into auth.users(id, email) values (p, p::text || '@example.invalid');
  insert into public.parents(id, name, email, postal) values (p, 'Probe parent', p::text || '@example.invalid', 'V6B 1A1');
  insert into public.children(id, parent_id, first_name, grade, province) values (child, p, 'Probe child', 3, 'BC');
  insert into public.card_setups(id, parent_id, child_id, plan, price, workbook_welcome_enabled, card_saved_at)
    values (card, p, child, 'one', 79.99, false, now());
  select to_jsonb(c) into before_card from public.card_setups c where c.id = card;

  if has_function_privilege('anon', 'public.claim_workbook_email(uuid,text,integer,jsonb,jsonb,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.claim_workbook_email(uuid,text,integer,jsonb,jsonb,uuid)', 'execute')
    or not has_function_privilege('service_role', 'public.claim_workbook_email(uuid,text,integer,jsonb,jsonb,uuid)', 'execute') then
    raise exception 'send claim role permissions changed';
  end if;

  set local role service_role;
  begin
    perform public.claim_workbook_email(card, 'ready', 0, '{}'::jsonb, msg, gen_random_uuid());
    raise exception 'ready accepted workbook zero';
  exception when check_violation then null;
  end;
  select claim_token into first_token from public.claim_workbook_email(card, 'ready', 1, '{}'::jsonb, msg, gen_random_uuid());
  if first_token is null then raise exception 'ready did not claim'; end if;
  select count(*) into n from public.claim_workbook_email(card, 'ready', 1, '{}'::jsonb, msg, gen_random_uuid());
  if n <> 0 then raise exception 'ready claimed twice'; end if;
  begin
    perform public.claim_workbook_email(card, 'dispatch', 1, hand, msg, gen_random_uuid());
    raise exception 'dispatch overtook active ready';
  exception when others then if sqlerrm <> 'ready_sending' then raise; end if;
  end;
  update public.workbook_emails set status = 'failed' where card_setup_id = card and kind = 'ready' and workbook_number = 1;
  select claim_token into retry_token from public.claim_workbook_email(card, 'ready', 1, '{}'::jsonb, msg, gen_random_uuid());
  if retry_token is null or retry_token = first_token then raise exception 'refused ready did not retry with a new token'; end if;
  update public.workbook_emails set status = 'sent' where card_setup_id = card and claim_token = first_token and status = 'sending';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'old ready outcome changed retry'; end if;
  update public.workbook_emails set status = 'unknown' where card_setup_id = card and kind = 'ready' and workbook_number = 1;
  select count(*) into n from public.claim_workbook_email(card, 'ready', 1, '{}'::jsonb, msg, gen_random_uuid());
  if n <> 0 then raise exception 'uncertain ready was retried'; end if;
  select count(*) into n from public.claim_workbook_email(card, 'dispatch', 1, hand, msg, gen_random_uuid());
  if n <> 1 then raise exception 'uncertain ready blocked dispatch'; end if;
  select count(*) into n from public.claim_workbook_email(card, 'dispatch', 1, '{"method":"mail","carrier":"Other","trackingNumber":"T2"}'::jsonb, msg, gen_random_uuid());
  if n <> 0 then raise exception 'courier sent again after hand delivery'; end if;
  select count(*) into n from public.claim_workbook_email(card, 'ready', 1, '{}'::jsonb, msg, gen_random_uuid());
  if n <> 0 then raise exception 'ready sent after dispatch'; end if;

  perform public.claim_workbook_email(card, 'ready', 2, '{}'::jsonb, msg, gen_random_uuid());
  update public.workbook_emails set claimed_at = now() - interval '11 minutes' where card_setup_id = card and kind = 'ready' and workbook_number = 2;
  select count(*) into n from public.claim_workbook_email(card, 'dispatch', 2, hand, msg, gen_random_uuid());
  if n <> 1 then raise exception 'abandoned ready blocked dispatch forever'; end if;
  if not exists (select 1 from public.workbook_emails where card_setup_id = card and kind = 'ready' and workbook_number = 2 and status = 'unknown') then raise exception 'abandoned ready was not held as uncertain'; end if;
  select count(*) into n from public.claim_workbook_email(card, 'ready', 2, '{}'::jsonb, msg, gen_random_uuid());
  if n <> 0 then raise exception 'abandoned ready was reclaimed'; end if;

  insert into public.workbook_emails(card_setup_id, parent_id, child_id, kind, workbook_number)
    values (card, p, child, 'ready', 3);
  perform public.claim_workbook_email(card, 'dispatch', 3, hand, msg, gen_random_uuid());
  if not exists (select 1 from public.workbook_emails where card_setup_id = card and kind = 'ready' and workbook_number = 3 and status = 'skipped') then raise exception 'dispatch did not skip queued ready'; end if;
  select count(*) into n from public.claim_workbook_email(card, 'welcome', 0, '{}'::jsonb, msg, gen_random_uuid());
  if n <> 0 then raise exception 'welcome followed a later-stage notice'; end if;
  if (select to_jsonb(c) from public.card_setups c where c.id = card) is distinct from before_card then raise exception 'email changed the saved card or plan'; end if;
  if exists (select 1 from public.workbook_emails where card_setup_id = card and kind = 'dispatch' and workbook_number = 1 and delivery is distinct from hand) then raise exception 'duplicate changed delivery details'; end if;
  if exists (select 1 from public.workbook_emails where card_setup_id = card and status = 'sending' and text_body is distinct from msg->>'text') then raise exception 'ledger did not keep the exact message'; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.workbook_emails;
  if n <> 0 then raise exception 'parent read workbook email copies'; end if;
  reset role;
  delete from public.parents where id = p;
  if exists (select 1 from public.workbook_emails where parent_id = p) then raise exception 'deletion left email copies'; end if;
end;
$$;
rollback;
select 'ready email claims, refusal, uncertain outcomes, ordering, tracking keys, role access and deletion passed; all probe rows rolled back' as result;
