-- Synthetic data only. The caught subtransaction removes every probe row.
do $$
declare
  p uuid:=gen_random_uuid(); foreign_p uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); sibling uuid:=gen_random_uuid();
  card uuid:=gen_random_uuid(); book uuid:=gen_random_uuid(); printed uuid:=gen_random_uuid();
  audit bigint; ctx jsonb; q jsonb; o jsonb; started jsonb; op uuid; today date; v text; n integer;
begin
  begin
    insert into auth.users(id,email) values(p,'plan-controls-probe@example.invalid'),(foreign_p,'plan-controls-foreign-probe@example.invalid');
    insert into public.parents(id,name,email,time_zone) values(p,'Probe','plan-controls-probe@example.invalid','America/Vancouver'),(foreign_p,'Foreign','plan-controls-foreign-probe@example.invalid','America/Toronto');
    insert into public.test_accounts(parent_id,marked_by) values(p,p),(foreign_p,foreign_p);
    insert into public.children(id,parent_id,first_name,grade,province) values(c,p,'Control',2,'BC'),(sibling,p,'Sibling',2,'BC');
    insert into public.card_setups(id,parent_id,child_id,plan,price) values(card,p,c,'one',79.99);
    insert into public.workbooks(id,parent_id,child_id,number,levels,status,shipped_at) values(book,p,c,1,array[2],'shipped',clock_timestamp()-interval '2 days');
    insert into public.workbook_audit(parent_id,child_id,workbook_id,actor_id,actor_email,action,detail)
      values(p,c,book,p,'plan-controls-probe@example.invalid','workbook-delivered','{}') returning id into audit;
    insert into public.workbook_delivery_receipts(workbook_id,parent_id,child_id,number,delivered_at,local_time,time_zone,zone_override,actor_id,audit_id)
      values(book,p,c,1,date_trunc('minute',clock_timestamp()-interval '1 day'),to_char(clock_timestamp()-interval '1 day','YYYY-MM-DD"T"HH24:MI'),'America/Vancouver',false,p,audit);

    -- Actual service role owns the public control entry points. Private helpers remain unavailable.
    set local role service_role;
    if public.plan_control_context(foreign_p,card) is not null then raise exception 'foreign control context'; end if;
    if public.plan_mailing_weeks(foreign_p,c,2)<>0 then raise exception 'foreign mailing read'; end if;
    ctx:=public.plan_control_context(p,card);
    if not (ctx->>'firstDelivered')::boolean then raise exception 'delivery not found'; end if;
    reset role;
    select period into today from public._maya_family_window(p,'day',clock_timestamp());
    q:=jsonb_build_object('location',ctx->'family'||jsonb_build_object('province',ctx->'province'),
      'weeks',2,'year',extract(year from today),'today',today,'used',0,'bookId',book,
      'shippedAt',ctx->'book'->'shippedAt','deliveredAt',ctx->'book'->'deliveredAt','targetNumber',2,
      'kind','trial','subscription','sub_probe','previousCharge','2027-01-01T12:00:00Z','chargeAt','2027-01-15T12:00:00Z');
    set local role service_role;
    if public.admit_plan_pause(foreign_p,card,'foreign',q) is not null then raise exception 'foreign admission'; end if;
    if public.admit_plan_pause(p,card,'bad-year',q||jsonb_build_object('year',extract(year from today)-1)) is not null then raise exception 'stale year'; end if;
    o:=public.admit_plan_pause(p,card,'probe-pause',q);
    if o is null or not (o->>'send')::boolean then raise exception 'pause not admitted'; end if;
    if (public.admit_plan_pause(p,card,'probe-pause',q)->>'send')::boolean then raise exception 'duplicate sends'; end if;
    if public.check_parent_family_deletion(p)<>'busy' then raise exception 'pending pause permits deletion'; end if;
    perform public.finish_plan_control((o->>'id')::uuid,'applied');
    if public.plan_mailing_weeks(p,c,3)<>2 then raise exception 'later number skips obligation'; end if;
    reset role;
    insert into public.workbooks(id,parent_id,child_id,number,levels,status) values(printed,p,c,3,array[2],'printed');
    begin
      perform public.start_workbook_run(c,p,'plan-controls-probe@example.invalid',3,360);
      raise exception 'prepare skipped paused target';
    exception when sqlstate '55000' then if sqlerrm<>'plan_paused' then raise; end if; end;
    begin
      perform public.mark_workbook(printed,'shipped',p,'plan-controls-probe@example.invalid');
      raise exception 'shipment skipped paused target';
    exception when sqlstate '55000' then if sqlerrm<>'plan_paused' then raise; end if; end;
    -- Refused cancellation does not mark the plan cancelled or retire its mailing effect.
    set local role service_role;
    op:=public.admit_plan_cancel(p,card);
    perform public.finish_plan_control(op,'refused');
    ctx:=public.plan_control_context(p,card);
    if (ctx->>'cancelled')::boolean or (ctx->>'blocked')::boolean then raise exception 'refusal retains stop'; end if;
    if public.plan_mailing_weeks(p,c,3)<>2 then raise exception 'refusal retires pause'; end if;
    -- Applied cancellation closes the prior period. Allowance use stays recorded.
    op:=public.admit_plan_cancel(p,card);
    perform public.finish_plan_control(op,'applied');
    if public.plan_mailing_weeks(p,c,3)<>0 then raise exception 'old mailing effect retained'; end if;
    ctx:=public.plan_control_context(p,card);
    if not (ctx->>'cancelled')::boolean or ctx->'pauses'->0->>'weeks'<>'2' then raise exception 'cancel state or allowance lost'; end if;
    begin
      perform public.admit_plan_start(card,1,'probe-old','pm_probe');
      raise exception 'old initial caller admitted repeat trial';
    exception when sqlstate '55000' then if sqlerrm<>'restart_required' then raise; end if; end;
    started:=public.admit_plan_start_terms(card,1,'probe-paid','pm_probe','restart',7999,op::text);
    if started->>'purpose'<>'restart' or (started->>'monthly_cents')::integer<>7999 then raise exception 'paid terms lost'; end if;
    begin
      perform public.admit_plan_start(card,1,'probe-old','pm_probe');
      raise exception 'old caller received paid key';
    exception when sqlstate '55000' then if sqlerrm<>'restart_required' then raise; end if; end;
    perform public.finish_plan_start(card,1,'started','sub_probe',clock_timestamp(),false);
    ctx:=public.plan_control_context(p,card);
    if (ctx->>'cancelled')::boolean then raise exception 'restart keeps stop'; end if;
    reset role;
    if not exists(select 1 from public.workbook_restart_requests where card_setup_id=card and generation=1 and run_id is null) then raise exception 'restart request missing'; end if;
    perform public.start_workbook_run(c,p,'plan-controls-probe@example.invalid',3,360);
    if exists(select 1 from public.workbook_restart_requests where card_setup_id=card and run_id is null) then raise exception 'prepare did not link request'; end if;
    if exists(select 1 from public.child_plan_controls where child_id=sibling) then raise exception 'sibling changed'; end if;

    -- Every new family-owned table carries both write fences and cascading ownership.
    foreach v in array array['child_plan_controls','plan_control_operations','workbook_restart_requests'] loop
      select count(*) into n from pg_trigger where tgrelid=('public.'||v)::regclass and tgname in ('fence_family_write','fence_child_delete_write');
      if n<>2 then raise exception 'missing fence on %',v; end if;
      if has_table_privilege('authenticated','public.'||v,'SELECT') or has_table_privilege('anon','public.'||v,'SELECT')
        or has_table_privilege('service_role','public.'||v,'INSERT') then raise exception 'direct access on %',v; end if;
    end loop;
    if has_function_privilege('service_role','public.plan_control_owner(uuid,uuid)','EXECUTE')
      or has_function_privilege('authenticated','public.admit_plan_cancel(uuid,uuid)','EXECUTE') then raise exception 'helper grants'; end if;
    insert into public.child_deletions(child_id,parent_id) values(c,p);
    begin
      perform public.admit_plan_cancel(p,card);
      raise exception 'child deletion permits control';
    exception when sqlstate '55000' then null; end;
    delete from public.children where id=c;
    if exists(select 1 from public.child_plan_controls where child_id=c)
      or exists(select 1 from public.plan_control_operations where child_id=c)
      or exists(select 1 from public.workbook_restart_requests where child_id=c) then raise exception 'child control rows retained'; end if;
    if not exists(select 1 from public.children where id=sibling) then raise exception 'sibling removed'; end if;
    insert into public.card_setups(id,parent_id,child_id,plan,price) values(card,p,sibling,'one',79.99);
    update public.parents set deletion_requested_at=clock_timestamp() where id=p;
    begin
      perform public.admit_plan_cancel(p,card);
      raise exception 'family deletion permits control';
    exception when sqlstate '55000' then null; end;
    raise exception 'rollback all synthetic data' using errcode='P5555';
  exception when sqlstate 'P5555' then null; end;
  if exists(select 1 from public.parents where id in (p,foreign_p)) or exists(select 1 from auth.users where id in (p,foreign_p)) then raise exception 'probe rows retained'; end if;
end $$;
select 'PLAN_CONTROLS_HOSTED_PROBE_OK' as result,
  (select count(*) from public.parents where email in ('plan-controls-probe@example.invalid','plan-controls-foreign-probe@example.invalid')) as remaining_probe_parents;
