-- Synthetic test families only. No Stripe requests and no deletion. All writes roll back.
begin;
do $$
declare a uuid := gen_random_uuid(); p uuid; other_p uuid := gen_random_uuid(); c uuid; card uuid; op uuid; i int; result boolean; before_control jsonb;
begin
  insert into auth.users(id,email) values(a,a::text||'@example.invalid');
  insert into public.admin_users(user_id,email,name) values(a,a::text||'@example.invalid','Cancel probe admin');
  insert into auth.users(id,email) values(other_p,other_p::text||'@example.invalid');
  insert into public.parents(id,name,email,postal) values(other_p,'Cancel recovery probe',other_p::text||'@example.invalid','V6B 1A1');
  for i in 1..4 loop
    p:=gen_random_uuid(); c:=gen_random_uuid(); card:=gen_random_uuid();
    insert into auth.users(id,email) values(p,p::text||'@example.invalid');
    insert into public.parents(id,name,email,postal) values(p,'Cancel recovery probe',p::text||'@example.invalid','V6B 1A1');
    insert into public.test_accounts(parent_id,marked_by) values(p,p);
    insert into public.children(id,parent_id,first_name,grade,province) values(c,p,'Probe',2,'BC');
    insert into public.card_setups(id,parent_id,child_id,plan,price) values(card,p,c,'one',79.99);
    op:=public.admit_plan_cancel(p,card);
    if op is null then raise exception 'cancel was not admitted'; end if;
    if public.admit_plan_cancel(p,card) is not null then raise exception 'duplicate admission'; end if;
    if public.check_parent_family_deletion(p)<>'busy' then raise exception 'open cancel permits deletion'; end if;
    update public.plan_control_operations set created_at=clock_timestamp()-interval '11 minutes' where id=op;
    if not exists(select 1 from public.due_plan_cancel_alerts(clock_timestamp()-interval '10 minutes',50) where id=op) then raise exception 'old cancel missing from sweep'; end if;
    if i>2 then update public.parents set deletion_requested_at=clock_timestamp() where id=p; end if;
    -- The authenticated admin list works for both ordinary and fenced families. A parent sees none.
    perform set_config('request.jwt.claim.sub',p::text,true);
    if exists(select 1 from public.admin_open_plan_cancels(p)) then raise exception 'parent can list operations'; end if;
    perform set_config('request.jwt.claim.sub',a::text,true);
    if not exists(select 1 from public.admin_open_plan_cancels(p) where id=op) then raise exception 'admin cannot list open cancel'; end if;
    perform set_config('request.jwt.claim.sub','',true);
    -- These claims must also work behind the family fence.
    if not public.claim_plan_cancel_alert(op) then raise exception 'first alert claim failed'; end if;
    if public.claim_plan_cancel_alert(op) then raise exception 'duplicate alert claim'; end if;
    perform public.note_plan_cancel_alert(op,'unknown');
    if public.claim_plan_cancel_alert(op) then raise exception 'unknown alert resent'; end if;
    if exists(select 1 from public.due_plan_cancel_alerts(clock_timestamp(),1000) where id=op) then raise exception 'claimed cancel starves sweep'; end if;
    if public.close_plan_cancel(other_p,op,'applied') then raise exception 'foreign family closed cancel'; end if;
    select to_jsonb(x) into before_control from public.child_plan_controls x where child_id=c;
    if i>2 then
      begin
        perform public.finish_plan_control(op,'applied');
        raise exception 'old finish changed its fenced behavior';
      exception when sqlstate '55000' then null; end;
      begin
        update public.plan_control_operations set quote='{"changed":true}' where id=op;
        raise exception 'fenced operation permitted an unrelated write';
      exception when sqlstate '55000' then null; end;
      begin
        update public.plan_control_operations set state='refused',finished_at=clock_timestamp(),deletion_closed_at=clock_timestamp(),quote='{"changed":true}' where id=op;
        raise exception 'recovery marker permitted an unrelated write';
      exception when sqlstate '55000' then null; end;
      begin
        update public.card_setups set price=1 where id=card;
        raise exception 'fenced card write permitted';
      exception when sqlstate '55000' then null; end;
    end if;
    result:=public.close_plan_cancel(p,op,case when i%2=1 then 'applied' else 'refused' end);
    if not result then raise exception 'close did not release cancel'; end if;
    if exists(select 1 from public.family_card_operations where id=op) then raise exception 'hold retained'; end if;
    if exists(select 1 from public.plan_control_operations where id=op and state='open') then raise exception 'cancel retained'; end if;
    if public.close_plan_cancel(p,op,'refused') then raise exception 'closed operation changed again'; end if;
    if i>2 then
      if (select to_jsonb(x) from public.child_plan_controls x where child_id=c) is distinct from before_control then raise exception 'fenced close wrote plan control'; end if;
      begin
        perform public.admit_plan_cancel(p,card);
        raise exception 'fenced admission permitted';
      exception when sqlstate '55000' then null; end;
    else
      if (select cancelled from public.child_plan_controls where child_id=c) is distinct from (i=1) then raise exception 'normal cancellation state wrong'; end if;
      if i=2 and public.admit_plan_cancel(p,card) is null then raise exception 'refusal blocks retry'; end if;
    end if;
  end loop;
  if has_function_privilege('authenticated','public.close_plan_cancel(uuid,uuid,text)','execute')
    or has_function_privilege('anon','public.claim_plan_cancel_alert(uuid)','execute')
    or has_table_privilege('authenticated','public.plan_cancel_alerts','SELECT') then raise exception 'recovery privilege too broad'; end if;
end $$;
select 'PLAN_CANCEL_RECOVERY_PROBE_OK' as result;
rollback;
