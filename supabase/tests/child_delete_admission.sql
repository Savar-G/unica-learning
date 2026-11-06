begin;
do $$
declare p uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); card uuid:=gen_random_uuid(); h uuid:=gen_random_uuid(); t uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email) values(p,p::text||'@example.invalid');
 insert into public.parents(id,name,email) values(p,'Probe',p::text||'@example.invalid');
 insert into public.children(id,parent_id,first_name,grade,province) values(c,p,'Remove',2,'BC'),(s,p,'Keep',2,'BC');
 insert into public.card_setups(id,parent_id,child_id,plan,price) values(card,p,c,'one',79.99);
 if to_regclass('public.plan_starts') is not null then
   execute 'insert into public.plan_starts(card_setup_id,generation,parent_id,start_key,payment_method_id,state) values($1,1,$2,$1::text,''pm_probe'',''open'')' using card,p;
   if public.check_child_deletion(p,c)<>'busy' then raise exception 'open start permitted delete'; end if;
   if public.check_child_deletion(p,s)<>'ready' then raise exception 'sibling blocked by other child start'; end if;
   execute 'update public.plan_starts set state=''refused'',finished_at=now() where card_setup_id=$1' using card;
 end if;
 if public.check_child_deletion(p,c)<>'ready' then raise exception 'settled start blocked delete'; end if;
 perform public.begin_family_card_operation(p,card);
 if public.check_child_deletion(p,c)<>'busy' then raise exception 'inflight start permitted delete'; end if;
 perform public.end_family_card_operation(card);
 perform public.begin_family_delete_hold(p,h);
 if public.request_child_deletion_held(p,c,h)<>'requested' then raise exception 'queue'; end if;
 begin
   perform public.begin_family_card_operation(p,card); raise exception 'new plan allowed';
 exception when sqlstate '55000' then null; end;
 if to_regclass('public.plan_starts') is not null then
   begin
    execute 'insert into public.plan_starts(card_setup_id,generation,parent_id,start_key,payment_method_id,state) values($1,2,$2,gen_random_uuid()::text,''pm_probe'',''open'')' using card,p;
    raise exception 'journal start allowed';
   exception when sqlstate '55000' then null; end;
 end if;
 if not public.claim_child_deletion(p,c,t) then raise exception 'claim'; end if;
 perform public.begin_family_delete_hold(p,h);
 if public.request_parent_family_deletion_held(p,h)<>'requested' then raise exception 'family request'; end if;
 begin
   perform public.assert_child_deletion_lease(p,c,t); raise exception 'child worker survived family request';
 exception when sqlstate '55000' then null; end;
 if public.check_child_deletion(p,c)<>'busy' then raise exception 'child request survived family request'; end if;
 -- Check the existing family's copy function, while the family fence is set.
 insert into public.anonymous_tests(copy_version,grade,province,test_month,test_family,copy) values(2,2,'BC',date_trunc('month',now()),true,'{}');
 if has_function_privilege('authenticated','public.complete_child_deletion(uuid,uuid,uuid)','execute')
   or has_function_privilege('anon','public.request_child_deletion_held(uuid,uuid,uuid)','execute')
   or has_table_privilege('authenticated','public.child_deletions','select')
   or has_table_privilege('service_role','public.child_deletions','delete') then raise exception 'permissions'; end if;
end $$;
select 'CHILD_ADMISSION_PROBE_OK' as result;
rollback;
