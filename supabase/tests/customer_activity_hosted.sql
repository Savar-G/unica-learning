-- Hosted assertions. All synthetic identities and activity roll back. No email or model call runs.
begin;
set local statement_timeout='8s';
do $$
declare role_name text; f record; p uuid:=gen_random_uuid(); other_p uuid:=gen_random_uuid();
 c uuid:=gen_random_uuid(); other_c uuid:=gen_random_uuid(); actor uuid; request_id uuid:=gen_random_uuid(); outcome text;
begin
 if (select count(*) from pg_class where oid in ('public.customer_activity'::regclass,'public.customer_activity_coverage'::regclass) and relrowsecurity)<>2 then raise exception 'activity_rls_missing'; end if;
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(role_name,'public.customer_activity','SELECT') or has_table_privilege(role_name,'public.customer_activity','INSERT')
    or has_table_privilege(role_name,'public.customer_activity_history','SELECT') then raise exception 'direct_activity_grant'; end if;
  if has_function_privilege(role_name,'public.record_customer_activity(uuid,uuid,uuid,uuid,text,text,uuid,text)','EXECUTE')<>(role_name='service_role') then raise exception 'activity_writer_grant'; end if;
  if has_function_privilege(role_name,'public.record_customer_plan_actor(uuid,integer,uuid)','EXECUTE')<>(role_name='service_role') then raise exception 'plan_actor_writer_grant'; end if;
  if has_function_privilege(role_name,'public.purge_customer_activity()','EXECUTE')<>(role_name='service_role') then raise exception 'purge_grant'; end if;
 end loop;
 for f in select oid,proconfig from pg_proc where pronamespace='public'::regnamespace and proname in ('admin_customer_book','admin_customer_children','admin_customer_history','admin_customer_metrics','record_customer_activity','record_customer_plan_actor','purge_customer_activity') loop
  if not ('search_path=""'=any(f.proconfig)) then raise exception 'unsafe_search_path'; end if;
  if has_function_privilege('anon',f.oid,'EXECUTE') then raise exception 'anonymous_function_grant'; end if;
 end loop;
 select user_id into actor from public.admin_users order by created_at limit 1;
 if actor is null then raise exception 'missing_admin_for_probe'; end if;
 insert into auth.users(id,email) values(p,p||'@example.invalid'),(other_p,other_p||'@example.invalid');
 insert into public.parents(id,name,email) values(p,'Activity probe',p||'@example.invalid'),(other_p,'Other activity probe',other_p||'@example.invalid');
 insert into public.test_accounts(parent_id,marked_by) values(p,actor),(other_p,actor);
 insert into public.children(id,parent_id,first_name,grade,province) values(c,p,'Probe',3,'BC'),(other_c,other_p,'Other probe',3,'BC');
 execute 'set local role service_role';
 outcome:=public.record_customer_activity(p,other_c,null,gen_random_uuid(),'page_visit','home',p,null);
 if outcome<>'refused' then raise exception 'cross_family_write_admitted'; end if;
 outcome:=public.record_customer_activity(p,c,null,gen_random_uuid(),'contact_note',null,p,'Probe');
 if outcome<>'refused' then raise exception 'forged_admin_admitted'; end if;
 outcome:=public.record_customer_activity(p,c,null,request_id,'page_visit','home',p,null);
 if outcome<>'saved' then raise exception 'valid_event_not_saved'; end if;
 if public.record_customer_activity(p,c,null,request_id,'page_visit','home',p,null)<>'duplicate' then raise exception 'retry_not_deduplicated'; end if;
 if public.record_customer_activity(p,c,null,gen_random_uuid(),'contact_note',null,actor,'Private probe')<>'saved' then raise exception 'valid_note_not_saved'; end if;
 execute 'reset role';
 begin update public.customer_activity set event='page_visit' where parent_id=p; raise exception 'append_only_failed';
 exception when raise_exception then if sqlerrm='append_only_failed' then raise; end if; end;
 insert into public.child_deletions(child_id,parent_id) values(c,p);
 if public.record_customer_activity(p,c,null,gen_random_uuid(),'page_visit','home',p,null)<>'refused' then raise exception 'deleted_child_write_admitted'; end if;
 update public.parents set deletion_requested_at=now() where id=other_p;
 if public.record_customer_activity(other_p,null,null,gen_random_uuid(),'page_visit','home',other_p,null)<>'unavailable' then raise exception 'deleting_family_write_admitted'; end if;
 delete from public.children where id=c;
 if exists(select 1 from public.customer_activity where child_id=c) then raise exception 'child_activity_survived_delete'; end if;
 delete from auth.users where id=p;
 if exists(select 1 from public.customer_activity where parent_id=p) then raise exception 'family_activity_survived_delete'; end if;
 perform set_config('request.jwt.claim.sub',other_p::text,true);
 execute 'set local role authenticated';
 begin perform public.admin_customer_history(); raise exception 'non_admin_history_admitted';
 exception when insufficient_privilege then null; end;
 begin perform public.admin_customer_children(); raise exception 'non_admin_children_admitted';
 exception when insufficient_privilege then null; end;
 begin perform public.admin_customer_book(gen_random_uuid()); raise exception 'non_admin_book_admitted';
 exception when insufficient_privilege then null; end;
 begin perform public.admin_customer_metrics(now()-interval '1 day',now()); raise exception 'non_admin_metrics_admitted';
 exception when insufficient_privilege then null; end;
 execute 'reset role';
end $$;
select 'passed' status,'RLS, grants, empty search paths, service admission, ownership, actors, retries, real deletion fences, cascades, non-admin readers' checks;
rollback;
