-- Owner-only rollback probe. All rows below are synthetic. Apply child_email_scope first.
-- A separate local probe (child_email_scope.cjs) proves both lock orders with two connections.
begin;
do $$
declare p uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); s uuid:=gen_random_uuid();
  mixed uuid:=gen_random_uuid(); sibling uuid:=gen_random_uuid(); later uuid:=gen_random_uuid();
  h uuid:=gen_random_uuid(); t uuid:=gen_random_uuid();
begin
  insert into auth.users(id,email) values(p,p::text||'@example.invalid');
  insert into public.parents(id,name,email) values(p,'Email scope probe',p::text||'@example.invalid');
  insert into public.children(id,parent_id,first_name,former_names,grade,province)
    values(c,p,'Al',array['Lee'],2,'BC'),(s,p,'Sally',array['Al'],2,'BC');
  -- The mixed claim has no copy yet. The sibling claim has a body with Al as a name fragment.
  insert into public.email_log(id,parent_id,kind,summary_month,status,attempts,unsubscribe_hash,copy_child_ids)
    values(mixed,p,'monthly_summary','2026-10-01','claimed',1,md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),array[c,s]),
      (sibling,p,'monthly_summary','2026-09-01','claimed',1,md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),array[s]);
  insert into public.email_copies(parent_id,email_log_id,outcome,subject,text_body,html_body,to_address)
    values(p,sibling,'sent','Sally with Maya','Sally only. Former name: Al.','<p>Sally</p>','parent@example.invalid');
  perform public.begin_family_delete_hold(p,h);
  if public.request_child_deletion_held(p,c,h)<>'requested' then raise exception 'request'; end if;
  if not public.claim_child_deletion(p,c,t) or not public.complete_child_deletion(p,c,t) then raise exception 'completion'; end if;
  if not exists(select 1 from public.email_copies where email_log_id=sibling) then raise exception 'sibling copy removed'; end if;
  if not exists(select 1 from public.email_log where id=mixed and copy_redacted) then raise exception 'claim not redacted'; end if;
  begin
    insert into public.email_copies(parent_id,email_log_id,outcome,subject,text_body,to_address)
      values(p,mixed,'sent','Late','Al /account?child='||c::text,'parent@example.invalid');
    raise exception 'late copy accepted';
  exception when sqlstate '55000' then null; end;
  -- The provider result remains recordable even when the copy is refused.
  update public.email_log set status='sent',sent_at=now(),email_id='synthetic-result' where id=mixed;
  -- A legitimate surviving-child send and copy still work immediately after deletion.
  insert into public.email_log(id,parent_id,kind,summary_month,status,attempts,unsubscribe_hash,copy_child_ids)
    values(later,p,'monthly_summary','2026-11-01','claimed',1,md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),array[s]);
  insert into public.email_copies(parent_id,email_log_id,outcome,subject,text_body,to_address)
    values(p,later,'sent','Sally summary','Sally only','parent@example.invalid');
  if exists(select 1 from public.children where id=c) or not exists(select 1 from public.children where id=s) then raise exception 'child scope'; end if;
  if has_function_privilege('service_role','public.redact_child_email_logs(uuid,uuid)','execute')
    or has_function_privilege('anon','public.email_copy_child_scope(public.email_log)','execute') then raise exception 'internal grants'; end if;
end $$;

-- Unknown pre-migration rows cannot be reconstructed from names. Seed that state under the owner in this transaction.
-- Disabling only the new capture trigger permits a synthetic old row; it is re-enabled before the check.
do $$
declare p uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); e uuid:=gen_random_uuid();
begin
  insert into auth.users(id,email) values(p,p::text||'@example.invalid');
  insert into public.parents(id,name,email) values(p,'Legacy scope probe',p::text||'@example.invalid');
  insert into public.children(id,parent_id,first_name,grade,province) values(c,p,'Al',2,'BC'),(s,p,'Sally',2,'BC');
  alter table public.email_log disable trigger capture_email_copy_scope;
  insert into public.email_log(id,parent_id,kind,summary_month,status,attempts,unsubscribe_hash)
    values(e,p,'monthly_summary','2026-10-01','claimed',1,md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text));
  alter table public.email_log enable trigger capture_email_copy_scope;
  begin
    perform public.check_child_deletion(p,c);
    raise exception 'unknown email scope allowed deletion';
  exception when sqlstate '55000' then
    if sqlerrm<>'email_scope_unknown' then raise; end if;
  end;
  if exists(select 1 from public.child_deletions where parent_id=p) then raise exception 'unknown request written'; end if;
end $$;
select 'CHILD_EMAIL_SCOPE_PROBE_OK' as result;
rollback;
