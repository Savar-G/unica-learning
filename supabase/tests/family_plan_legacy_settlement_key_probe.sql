-- A final start cannot settle an unrelated reservation with a different key.
do $$
declare p uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); k uuid:=gen_random_uuid(); a jsonb;
begin
  insert into auth.users(id,email) values(p,p::text||'@example.invalid');
  insert into public.parents(id,name,email) values(p,'Reservation key probe',p::text||'@example.invalid');
  insert into public.children(id,parent_id,first_name,grade,province) values(c,p,'First',3,'BC');
  insert into public.card_setups(id,parent_id,child_id,plan,price,workbook_welcome_enabled) values(k,p,c,'one',79.99,false);
  a:=public.admit_plan_start_terms(k,1,k::text,'pm_probe','initial',7999,'');
  insert into public.family_plan_windows(parent_id,first_child_id,start_key,started_at,ends_at) values(p,c,'unrelated-key',now(),now()+interval '720 hours');
  insert into public.child_plan_prices(parent_id,child_id,monthly_cents,start_key) values(p,c,7999,'unrelated-key');
  perform public.finish_plan_start(k,1,'refused',null,null,false);
  if exists(select 1 from public.family_plan_windows where parent_id=p and (confirmed or released))
    or exists(select 1 from public.child_plan_prices where parent_id=p and (confirmed or released)) then raise exception 'unmatched reservation settled'; end if;
end $$;
select 'LEGACY_SETTLEMENT_KEY_MATCH_OK' as result;
