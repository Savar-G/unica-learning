-- A new family start may resolve after a deletion request. It must not queue an email.
do $$
declare p uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); k uuid:=gen_random_uuid(); a jsonb;
begin
  insert into auth.users(id,email) values(p,p::text||'@example.invalid');
  insert into public.parents(id,name,email) values(p,'Deletion guard probe',p::text||'@example.invalid');
  insert into public.children(id,parent_id,first_name,grade,province) values(c,p,'Synthetic child',3,'BC');
  insert into public.card_setups(id,parent_id,child_id,plan,price,workbook_welcome_enabled) values(k,p,c,'one',79.99,false);
  a:=public.admit_family_plan_start(k,1,k::text,'pm_probe','initial',7999,'');
  update public.parents set deletion_requested_at=now() where id=p;
  if not public.finish_plan_start(k,1,'started','sub_probe',(a->>'trial_end')::timestamptz,true) then raise exception 'resolution refused'; end if;
  if (select email_state from public.plan_starts where card_setup_id=k and generation=1)<>'none' then raise exception 'deleting family email queued'; end if;
end $$;
select 'FAMILY_PLAN_DELETION_EMAIL_GUARD_OK' as result;
