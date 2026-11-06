-- Hosted effective-role check. Every fixture and temporary Admin role rolls back.
-- No provider, Storage file, email or real family is used.
do $$
declare
  p uuid:=gen_random_uuid(); other_parent uuid:=gen_random_uuid(); adm uuid:=gen_random_uuid();
  c uuid:=gen_random_uuid(); sibling uuid:=gen_random_uuid(); w uuid:=gen_random_uuid(); pg uuid:=gen_random_uuid();
  at_time timestamptz:=date_trunc('minute',clock_timestamp()-interval '1 hour');
  r jsonb; n integer; original_audit bigint; latest public.workbook_delivery_corrections;
  checks integer:=0;
begin
  begin
    insert into auth.users(id,email) values(p,'answer-parent-probe@example.invalid'),
      (other_parent,'answer-foreign-probe@example.invalid'),(adm,'answer-admin-probe@example.invalid');
    insert into public.parents(id,name,email) values(p,'Synthetic answer parent','answer-parent-probe@example.invalid'),
      (other_parent,'Synthetic foreign parent','answer-foreign-probe@example.invalid');
    insert into public.test_accounts(parent_id,marked_by) values(p,p),(other_parent,other_parent);
    insert into public.children(id,parent_id,first_name,grade,province) values(c,p,'Probe',3,'BC'),(sibling,p,'Sibling',3,'BC');
    insert into public.admin_users(user_id,email,name) values(adm,'answer-admin-probe@example.invalid','Temporary answer probe');
    insert into public.workbooks(id,parent_id,child_id,number,levels) values(w,p,c,1,'{10}');
    insert into public.workbook_pages(id,parent_id,workbook_id,page_number,page_type,day_label,qr_token)
      values(pg,p,w,1,'practice','Day 1',replace(gen_random_uuid()::text,'-',''));
    insert into public.workbook_questions(parent_id,workbook_id,page_id,question_number,question_key,schema_version,package,box_x,box_y,box_width,box_height)
      values(p,w,pg,1,'answer-probe',1,'{"id":"answer-probe","answer":{"value":425}}',1,1,20,20);
    update public.workbooks set status='shipped',shipped_at=clock_timestamp()-interval '2 days' where id=w;

    perform set_config('request.jwt.claim.sub',p::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',p,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    if not public.parent_reads_workbook(w) then raise exception 'old_shipped_ownership_not_binding'; end if;
    select count(*) into n from public.workbook_questions where workbook_id=w;
    if n<>0 then raise exception 'pre_delivery_answer_read'; end if;
    select count(*) into n from public.workbook_pages where workbook_id=w;
    if n<>1 then raise exception 'shipped_page_metadata_lost'; end if;
    execute 'reset role'; checks:=checks+1;

    perform set_config('request.jwt.claim.sub',adm::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',adm,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    if not public.is_admin() then raise exception 'admin_control_not_binding'; end if;
    select count(*) into n from public.workbook_questions where workbook_id=w;
    if n<>1 then raise exception 'admin_read_blocked'; end if;
    r:=public.confirm_workbook_delivery(w,c,1,at_time,to_char(at_time at time zone 'America/Vancouver','YYYY-MM-DD"T"HH24:MI'),'America/Vancouver',false);
    if r->>'status'<>'confirmed' then raise exception 'public_delivery_confirmation_failed: %',r; end if;
    execute 'reset role'; checks:=checks+1;
    select audit_id into original_audit from public.workbook_delivery_receipts where workbook_id=w;

    perform set_config('request.jwt.claim.sub',p::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',p,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    select count(*) into n from public.workbook_questions where workbook_id=w and package->'answer'->>'value'='425';
    if n<>1 then raise exception 'delivered_stored_answer_blocked'; end if;
    execute 'reset role'; checks:=checks+1;

    perform set_config('request.jwt.claim.sub',other_parent::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',other_parent,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    select count(*) into n from public.workbook_questions where workbook_id=w;
    if n<>0 then raise exception 'foreign_family_answer_read'; end if;
    execute 'reset role'; checks:=checks+1;
    begin
      execute 'set local role anon';
      select count(*) into n from public.workbook_questions where workbook_id=w;
      if n<>0 then raise exception 'anonymous_answer_read'; end if;
      execute 'reset role';
    exception when insufficient_privilege then execute 'reset role'; end;
    checks:=checks+1;
    execute 'set local role service_role';
    select count(*) into n from public.workbook_questions where workbook_id=w;
    if n<>1 then raise exception 'service_answer_read_blocked'; end if;
    execute 'reset role'; checks:=checks+1;

    perform set_config('request.jwt.claim.sub',adm::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',adm,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    r:=public.correct_workbook_delivery(w,c,1,at_time-interval '1 hour',to_char((at_time-interval '1 hour') at time zone 'America/Vancouver','YYYY-MM-DD"T"HH24:MI'),'America/Vancouver',false,'Synthetic role probe',gen_random_uuid(),original_audit);
    if r->>'status'<>'corrected' then raise exception 'public_delivery_correction_failed: %',r; end if;
    execute 'reset role';
    select * into latest from public.workbook_delivery_corrections where workbook_id=w order by audit_id desc limit 1;
    -- Fault injection stays inside the rollback. Real admin RPC refuses a future time.
    delete from public.workbook_delivery_corrections where id=latest.id;
    latest.delivered_at:=clock_timestamp()+interval '1 day'; latest.recorded_at:=clock_timestamp()+interval '2 days';
    insert into public.workbook_delivery_corrections select (latest).*;
    perform set_config('request.jwt.claim.sub',p::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',p,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    select count(*) into n from public.workbook_questions where workbook_id=w;
    if n<>0 then raise exception 'future_latest_correction_ignored'; end if;
    execute 'reset role'; checks:=checks+1;
    delete from public.workbook_delivery_corrections where id=latest.id;
    execute 'set local role authenticated';
    select count(*) into n from public.workbook_questions where workbook_id=w;
    if n<>1 then raise exception 'valid_original_not_restored'; end if;
    execute 'reset role'; checks:=checks+1;
    delete from public.workbook_delivery_receipts where workbook_id=w;
    execute 'set local role authenticated';
    select count(*) into n from public.workbook_questions where workbook_id=w;
    if n<>0 then raise exception 'retracted_receipt_answer_read'; end if;
    execute 'reset role'; checks:=checks+1;

    raise exception 'rollback_answer_probe' using errcode='P5591';
  exception when sqlstate 'P5591' then null;
  end;
  if exists(select 1 from auth.users where id in(p,other_parent,adm))
    or exists(select 1 from public.workbooks where id=w)
    or exists(select 1 from public.admin_users where user_id=adm) then raise exception 'answer_probe_not_clean'; end if;
  raise notice 'ANSWER_DELIVERY_HOSTED_PROBE_OK: % checks',checks;
end $$;
select 'ANSWER_DELIVERY_HOSTED_PROBE_OK' as result;
