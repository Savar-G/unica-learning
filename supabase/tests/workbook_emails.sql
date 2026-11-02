-- Hosted probe. All synthetic family rows, claims and copies are rolled back. No provider calls.
begin;
do $$
declare p uuid := gen_random_uuid(); child_a uuid := gen_random_uuid(); child_b uuid := gen_random_uuid();
  card_a uuid := gen_random_uuid(); card_b uuid := gen_random_uuid(); n integer; old_token uuid; new_token uuid;
  msg jsonb := '{"to":"probe@example.invalid","subject":"Probe","text":"Probe","html":"<p>Probe</p>"}';
  mail jsonb := '{"method":"mail","carrier":"Probe carrier","trackingNumber":"T1","trackingUrl":""}';
begin
  insert into auth.users(id, email) values (p, p::text || '@example.invalid');
  insert into public.parents(id, name, email, postal) values (p, 'Probe parent', p::text || '@example.invalid', 'V6B 1A1');
  insert into public.children(id, parent_id, first_name, grade, province) values
    (child_a, p, 'Probe A', 3, 'BC'), (child_b, p, 'Probe B', 3, 'BC');
  insert into public.card_setups(id, parent_id, child_id, plan, price, workbook_welcome_enabled)
    values (card_a, p, child_a, 'one', 79.99, true), (card_b, p, child_b, 'one', 79.99, false);
  update public.card_setups set card_saved_at = now() where id in (card_a, card_b);
  select count(*) into n from public.workbook_emails where card_setup_id = card_a and kind = 'welcome';
  if n <> 1 then raise exception 'new signup welcome was not queued'; end if;
  if exists (select 1 from public.workbook_emails where card_setup_id = card_b) then raise exception 'old signup was backfilled'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.workbook_emails;
  if n <> 0 then raise exception 'parent read an email'; end if;
  begin
    perform public.claim_workbook_email(card_a, 'welcome', 0, '{}'::jsonb, msg, gen_random_uuid());
    raise exception 'parent called send claim';
  exception when insufficient_privilege then null;
  end;
  reset role;
  set local role anon;
  begin
    perform count(*) from public.workbook_emails;
    raise exception 'anonymous read an email';
  exception when insufficient_privilege then null;
  end;
  reset role;

  set local role service_role;
  select claim_token into old_token from public.claim_workbook_email(card_a, 'welcome', 0, '{}'::jsonb, msg, gen_random_uuid());
  if old_token is null then raise exception 'welcome was not claimed'; end if;
  select count(*) into n from public.claim_workbook_email(card_a, 'welcome', 0, '{}'::jsonb, msg, gen_random_uuid());
  if n <> 0 then raise exception 'sending welcome was reclaimed'; end if;
  begin
    perform public.claim_workbook_email(card_a, 'dispatch', 1, mail, msg, gen_random_uuid());
    raise exception 'dispatch overtook a running welcome';
  exception when others then if sqlerrm <> 'welcome_sending' then raise; end if;
  end;
  update public.workbook_emails set status = 'failed' where card_setup_id = card_a and kind = 'welcome';
  select claim_token into new_token from public.claim_workbook_email(card_a, 'welcome', 0, '{}'::jsonb, msg, gen_random_uuid());
  if new_token is null or new_token = old_token then raise exception 'refusal did not get a fresh claim'; end if;
  update public.workbook_emails set status = 'sent' where card_setup_id = card_a and claim_token = old_token and status = 'sending';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'old outcome changed a new claim'; end if;
  update public.workbook_emails set status = 'unknown' where card_setup_id = card_a and kind = 'welcome';
  select count(*) into n from public.claim_workbook_email(card_a, 'welcome', 0, '{}'::jsonb, msg, gen_random_uuid());
  if n <> 0 then raise exception 'unknown welcome was retried'; end if;

  begin
    perform public.claim_workbook_email(card_a, 'dispatch', 1, '{"method":"mail"}'::jsonb, msg, gen_random_uuid());
    raise exception 'mail without tracking was accepted';
  exception when others then if sqlerrm <> 'tracking_required' then raise; end if;
  end;
  select count(*) into n from public.claim_workbook_email(card_a, 'dispatch', 1, mail, msg, gen_random_uuid());
  if n <> 1 then raise exception 'first workbook dispatch was not claimed'; end if;
  select count(*) into n from public.claim_workbook_email(card_a, 'dispatch', 1, mail || '{"trackingNumber":"T2"}'::jsonb, msg, gen_random_uuid());
  if n <> 0 then raise exception 'same workbook dispatch was claimed twice'; end if;
  if not exists (select 1 from public.workbook_emails where card_setup_id = card_a and kind = 'dispatch' and workbook_number = 1 and delivery->>'trackingNumber' = 'T1') then
    raise exception 'duplicate click changed the claimed details';
  end if;
  select count(*) into n from public.claim_workbook_email(card_a, 'dispatch', 2, '{"method":"hand"}'::jsonb, msg, gen_random_uuid());
  if n <> 1 then raise exception 'second workbook or hand delivery was blocked'; end if;
  select count(*) into n from public.claim_workbook_email(card_a, 'welcome', 0, '{}'::jsonb, msg, gen_random_uuid());
  if n <> 0 then raise exception 'welcome sent after dispatch'; end if;
  reset role;
  delete from public.parents where id = p;
  if exists (select 1 from public.workbook_emails where parent_id = p) then raise exception 'family deletion left workbook emails'; end if;
end;
$$;
rollback;
select 'workbook email queue, claim, refusal, unknown, tracking, role and deletion probes passed; synthetic rows rolled back' as result;
