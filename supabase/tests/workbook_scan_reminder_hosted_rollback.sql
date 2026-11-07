select set_config('statement_timeout','5s',true),set_config('lock_timeout','500ms',true);
do $qa475$
declare
 p uuid := '214286a1-db97-4c39-ace1-3253e632b700'; foreign_p uuid := 'eff33fbe-3053-4649-b562-b674ca7c0237'; actor uuid := 'b164c91e-6994-48f3-87e5-3e12346220f8';
 child uuid := '63faf6e3-4ef2-4bc5-be9e-f5050d73c570'; book uuid := 'a7c43b50-b8a2-46c9-b2f0-f6001657efbb'; pages uuid[] := array['2c0bf6ca-57fa-4f1e-baad-633e37fa1688','4ee9d4f7-80d6-4fb1-92d1-560aba87b066','c3885b4a-aa78-4539-90cf-cb3c2dc9fd0b']::uuid[];
 delivered timestamptz := '2026-10-01T12:00:00.000Z'; backstop timestamptz := '2026-10-22T12:00:00.000Z'; due_at timestamptz := '2026-10-05T12:00:00.000Z';
 answer jsonb; saved jsonb; context jsonb; proof jsonb := '{}'::jsonb; audit bigint;
 episode uuid; message_key uuid; attempt uuid; log_id uuid; n integer; rows_seen integer;
 denied boolean; owner_book integer; original_audit bigint;
begin
 begin
  insert into auth.users(id,email,aud,role) values
    (p,p::text||'@example.invalid','authenticated','authenticated'),
    (foreign_p,foreign_p::text||'@example.invalid','authenticated','authenticated'),
    (actor,actor::text||'@example.invalid','authenticated','authenticated');
  insert into public.parents(id,name,email,time_zone,postal) values
    (p,'Synthetic QA',p::text||'@example.invalid','UTC','V3S 1A1'),
    (foreign_p,'Foreign QA',foreign_p::text||'@example.invalid','UTC','V3S 1A1');
  insert into public.admin_users(user_id,name,email) values(actor,'Synthetic Admin',actor::text||'@example.invalid');
  insert into public.test_accounts(parent_id,marked_by) values(p,actor),(foreign_p,actor);
  insert into public.children(id,parent_id,first_name,grade,province) values(child,p,'Robin',3,'BC');
  insert into public.child_plan_states(child_id,parent_id,kind,read_at) values(child,p,'paying',clock_timestamp());
  insert into public.workbooks(id,parent_id,child_id,number,status,levels,printed_revision,print_manifest)
    values(book,p,child,1,'draft',array[16]::smallint[],'0123456789abcdef0123456789ab','{"version":1,"curriculum":{"key":"bc","version":"qa475"},"snapshotDay":7,"testWorkbook":false,"days":[{"day":1,"pages":[1]},{"day":7,"pages":[2,3]}],"levelTest":null}'::jsonb);
  for n in 1..3 loop
    insert into public.workbook_pages(id,workbook_id,parent_id,page_number,page_type,day_label,qr_token,print_contract)
      values(pages[n],book,p,n,'practice',case when n=1 then 'Day 1' else 'Day 7' end,
        replace(pages[n]::text,'-',''),jsonb_build_object('version',1,'workbookId',book,'page',n));
    insert into public.workbook_questions(workbook_id,page_id,parent_id,question_number,question_key,schema_version,package,box_x,box_y,box_width,box_height)
      values(book,pages[n],p,1,'qa475-'||n,1,jsonb_build_object('id','qa475-'||n),0,0,10,10);
  end loop;
  -- Fixture state only, inside this subtransaction. No print/ship UI, approval action or external object exists.
  update public.workbooks set status='shipped',shipped_at='2026-09-30T12:00:00Z' where id=book;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  answer := public.confirm_workbook_delivery(book,child,1,delivered,'2026-10-01T12:00','UTC',false);
  if answer->>'status'<>'confirmed' then raise exception 'QA delivery rejected: %',answer; end if;
  saved := public.confirm_workbook_delivery(book,child,1,delivered,'2026-10-01T12:00','UTC',false);
  if saved is distinct from answer then raise exception 'QA identical delivery changed'; end if;
  audit := (answer->'receipt'->>'audit_id')::bigint;
  original_audit := audit;
  execute 'reset role';
  execute 'set local role service_role';
  answer := public.record_workbook_scan_delivery_calendar(book,audit,delivered,'UTC',false,backstop,'family-time/20261106;node=22.23.1;icu=78.2;tz=2026a');
  if answer->>'status'<>'hold' then raise exception 'QA expected zero-scan HOLD: %',answer; end if;
  select count(*) into rows_seen from public.workbook_scan_trigger_claims where workbook_id=book;
  if rows_seen<>0 then raise exception 'QA zero scans admitted next book'; end if;
  proof := proof||jsonb_build_object('clock',answer->>'status','nextBookClaims',rows_seen);
  select count(*) into rows_seen from public.workbook_scan_backstop_holds where workbook_id=book and delivery_audit_id=audit;
  if rows_seen<>1 then raise exception 'QA zero-scan HOLD missing'; end if;
  proof := proof||jsonb_build_object('zeroScanHolds',rows_seen);
  context := public.read_workbook_scan_inactivity_context(book);
  if context->>'status'<>'read' or context->'identity'='null'::jsonb then raise exception 'QA inactivity context missing'; end if;
  answer := public.propose_workbook_scan_inactivity(book,audit,null,delivered,due_at,context->'identity'->'clock_context','family-time/20261106;node=22.23.1;icu=78.2;tz=2026a');
  if answer->>'status'<>'recorded' then raise exception 'QA inactivity refused: %',answer; end if;
  episode := (answer->'episode'->>'id')::uuid;
  proof := proof||jsonb_build_object('inactivity',answer->>'status');
  answer := public.read_workbook_scan_reminder_due(p);
  if answer->>'status'<>'ready' or jsonb_array_length(answer->'episode_ids')<>1 then raise exception 'QA due set mismatch: %',answer; end if;
  answer := public.claim_workbook_scan_reminder(p,array[episode],repeat('a',64));
  if answer->>'status'<>'claimed' then raise exception 'QA claim rejected: %',answer; end if;
  message_key := (answer->>'message_id')::uuid; attempt := (answer->>'attempt_token')::uuid; log_id := (answer->>'email_log_id')::uuid;
  proof := proof||jsonb_build_object('claim',answer->>'status');
  answer := public.admit_workbook_scan_reminder(message_key,attempt);
  if answer->>'status'<>'admitted' then raise exception 'QA admission refused: %',answer; end if;
  proof := proof||jsonb_build_object('admission',answer->>'status');
  insert into public.email_copies(parent_id,email_log_id,outcome,to_address,subject,text_body)
    values(p,log_id,'unknown','owned-qa@example.invalid','Synthetic rollback proof','No email was sent. Token: hidden.');
  select count(*) into rows_seen from public.email_copies e where e.parent_id=p and e.email_log_id=log_id;
  if rows_seen<>1 then raise exception 'QA positive copy row missing'; end if;
  proof := proof||jsonb_build_object('copies',rows_seen);
  answer := public.finish_workbook_scan_reminder(message_key,attempt,'unknown',null);
  if answer->>'status'<>'recorded' then raise exception 'QA unknown outcome missing'; end if;
  proof := proof||jsonb_build_object('unknownOutcome',answer->>'status');
  answer := public.claim_workbook_scan_reminder(p,array[episode],repeat('b',64));
  if answer->>'status'='claimed' then raise exception 'QA unknown claim retried'; end if;
  proof := proof||jsonb_build_object('repeatClaim',answer->>'status');
  answer := public.finish_workbook_scan_reminder(message_key,attempt,'sent','must-not-apply');
  if answer->>'status'<>'stale' then raise exception 'QA unknown overwritten'; end if;
  select count(*) into rows_seen from public.workbook_scan_reminder_attempts a where a.message_id=message_key;
  if rows_seen<>1 then raise exception 'QA repeat created another attempt'; end if;
  proof := proof||jsonb_build_object('attempts',rows_seen,'repeatFinish',answer->>'status');
  if not exists(select 1 from public.workbook_scan_reminder_messages m where m.id=message_key and m.state='unknown')
    or not exists(select 1 from public.workbook_scan_inactivity_episodes e where e.id=episode and e.consumed_token=attempt and e.dispatch_count=1)
    or not exists(select 1 from public.email_log l where l.id=log_id and l.status='claimed' and l.email_id is null and l.unsubscribe_hash=repeat('a',64))
    then raise exception 'QA unknown ledger changed'; end if;
  proof := proof||jsonb_build_object('unknownLedgerHeld',true);
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',p::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  if auth.uid() is distinct from p then raise exception 'QA owner JWT mismatch'; end if;
  select count(*) into owner_book from public.workbooks where id=book;
  if owner_book<>1 then raise exception 'QA owner positive workbook control failed'; end if;
  select count(*) into rows_seen from public.workbook_scan_inactivity_episodes where parent_id=p;
  if rows_seen<>0 then raise exception 'QA parent read private episodes'; end if;
  denied := false;
  begin perform public.read_workbook_scan_inactivity_context(book); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'QA parent called service RPC'; end if;
  proof := proof||jsonb_build_object('ownerBook',owner_book,'ownerPrivateEpisodes',rows_seen,'ownerRpcDenied',denied);
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',foreign_p::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',foreign_p,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  select count(*) into rows_seen from public.workbooks where id=book;
  if rows_seen<>0 then raise exception 'QA foreign family read book'; end if;
  proof := proof||jsonb_build_object('foreignBook',rows_seen);
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  select count(*) into rows_seen from public.workbook_scan_inactivity_episodes where parent_id=p;
  if rows_seen<>1 then raise exception 'QA admin positive episode control failed'; end if;
  proof := proof||jsonb_build_object('adminEpisodes',rows_seen);
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  execute 'set local role anon';
  denied:=false;
  begin perform 1 from public.workbook_scan_inactivity_episodes where parent_id=p; exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'QA anon read episodes'; end if;
  proof := proof||jsonb_build_object('anonTableDenied',denied);
  denied:=false;
  begin perform public.read_workbook_scan_inactivity_context(book); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'QA anon called service RPC'; end if;
  proof := proof||jsonb_build_object('anonRpcDenied',denied,'providerCalls',0,'storageObjects',0,'checkedAt',clock_timestamp());
  execute 'reset role';
  raise exception using errcode='P0475',message='rollback_only_qa475';
 exception when sqlstate 'P0475' then null;
 end;
 if exists(select 1 from public.parents where id in(p,foreign_p))
   or exists(select 1 from auth.users where id in(p,foreign_p,actor))
   or exists(select 1 from public.workbooks where id=book)
   or exists(select 1 from public.email_log where parent_id=p)
   or exists(select 1 from public.email_copies where parent_id=p) then raise exception 'QA rows survived rollback'; end if;
 proof := proof||jsonb_build_object('rowsRolledBack',true);
 perform set_config('unica.qa475proof',proof::text,false);
end $qa475$;
with saved as materialized(select current_setting('unica.qa475proof')::jsonb as proof)
select proof,set_config('unica.qa475proof','',false) as cleared from saved;
