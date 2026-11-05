begin;
do $$
declare p uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); e uuid:=gen_random_uuid(); keep uuid:=gen_random_uuid(); weekly uuid:=gen_random_uuid(); h uuid:=gen_random_uuid(); t uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email) values(p,p::text||'@example.invalid');
 insert into public.parents(id,name,email) values(p,'Email probe',p::text||'@example.invalid');
 insert into public.children(id,parent_id,first_name,grade,province) values(c,p,'Remove',2,'BC'),(s,p,'Keep',2,'BC');
 insert into public.email_log(id,parent_id,kind,summary_month,status,attempts,unsubscribe_hash,sent_at) values(e,p,'monthly_summary','2026-11-01','sent',1,md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),now()),(keep,p,'monthly_summary','2026-10-01','sent',1,md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),now());
 insert into public.email_copies(parent_id,email_log_id,outcome,subject,text_body,html_body,to_address) values
  (p,e,'sent','Two summaries','Open /account?child='||c::text||' and /account?child='||s::text,'<p>Two summaries</p>','parent@example.invalid'),
  (p,keep,'sent','Keep summary','Open /account?child='||s::text,'<p>Keep only</p>','parent@example.invalid');
 insert into public.email_log(id,parent_id,kind,week_start,status,attempts,unsubscribe_hash,sent_at)
  values(weekly,p,'maya_weekly','2026-11-02','sent',1,md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),now());
 insert into public.email_copies(parent_id,email_log_id,outcome,subject,text_body,html_body,to_address)
  values(p,weekly,'sent','Maya this week: Remove and Keep','Remove: a note. Keep: a different note.','<p>Both children</p>','parent@example.invalid');
 perform public.begin_family_delete_hold(p,h);
 perform public.request_child_deletion_held(p,c,h);
 perform public.claim_child_deletion(p,c,t);
 if not public.complete_child_deletion(p,c,t) then raise exception 'complete'; end if;
 if exists(select 1 from public.email_copies where email_log_id=e) then raise exception 'deleted child remains in family email copy'; end if;
 if exists(select 1 from public.email_copies where email_log_id=weekly) then raise exception 'deleted child remains in mixed Maya copy'; end if;
 if not exists(select 1 from public.email_copies where email_log_id=keep) then raise exception 'unrelated sibling email copy removed'; end if;
 if not exists(select 1 from public.email_log where id=e) then raise exception 'parent delivery ledger removed'; end if;
 begin
  insert into public.email_copies(parent_id,email_log_id,outcome,subject,text_body,html_body,to_address) values(p,e,'sent','Late','Deleted child data','<p>Late</p>','parent@example.invalid');
  raise exception 'late email copy restored child data';
 exception when sqlstate '55000' then null; end;
end $$;
select 'CHILD_EMAIL_COPIES_PROBE_OK' as result;
rollback;
