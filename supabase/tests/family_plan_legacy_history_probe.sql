-- A legacy first child starts after the schema migration and before PR B ships.
-- Only PR B's new admission may import its history and admit the sibling.
do $$
declare p uuid:=gen_random_uuid(); c1 uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid(); k1 uuid:=gen_random_uuid(); k2 uuid:=gen_random_uuid(); a jsonb; b jsonb; e timestamptz;
begin
  insert into auth.users(id,email) values(p,p::text||'@example.invalid');
  insert into public.parents(id,name,email) values(p,'Legacy history probe',p::text||'@example.invalid');
  insert into public.children(id,parent_id,first_name,grade,province) values(c1,p,'First',3,'BC'),(c2,p,'Sibling',3,'BC');
  insert into public.card_setups(id,parent_id,child_id,plan,price,workbook_welcome_enabled) values(k1,p,c1,'one',79.99,false),(k2,p,c2,'one',79.99,false);
  a:=public.admit_plan_start_terms(k1,1,k1::text,'pm_probe','initial',7999,'');
  e:=(a->>'at')::timestamptz+interval '720 hours';
  if exists(select 1 from public.family_plan_windows where parent_id=p) then raise exception 'legacy call opted into PR B'; end if;
  perform public.finish_plan_start(k1,1,'started','sub_probe',e,false);
  begin
    perform public.admit_plan_start_terms(k2,1,k2::text,'pm_probe','initial',7999,'');
    raise exception 'legacy sibling unexpectedly admitted';
  exception when sqlstate '55000' then if sqlerrm<>'family_plan_upgrade_required' then raise; end if; end;
  if exists(select 1 from public.plan_starts where card_setup_id=k2) then raise exception 'refused sibling retained admission'; end if;
  if public.family_plan_price(p,k2,7999)<>5999 then raise exception 'PR B preview missed legacy sibling price'; end if;
  b:=public.admit_family_plan_start(k2,1,k2::text,'pm_probe','initial',7999,'');
  if (b->>'monthly_cents')::int<>5999 or (b->>'trial_end')::timestamptz<>e then raise exception 'PR B gave legacy family wrong terms'; end if;
  if not (b->>'family_terms')::boolean then raise exception 'PR B opt-in absent'; end if;
end $$;
select 'LEGACY_HISTORY_IMPORT_OK' as result;
