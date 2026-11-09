-- Run inside BEGIN / ROLLBACK. Uses the public deletion and admission functions.
do $$
declare p uuid:=gen_random_uuid(); c1 uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid(); k1 uuid:=gen_random_uuid(); k2 uuid:=gen_random_uuid(); token uuid:=gen_random_uuid(); a jsonb; b jsonb; e timestamptz:=now()-interval '1 day';
begin
  insert into auth.users(id,email) values(p,p::text||'@example.invalid');
  insert into public.parents(id,name,email) values(p,'Legacy deletion probe',p::text||'@example.invalid');
  insert into public.children(id,parent_id,first_name,grade,province) values(c1,p,'First',3,'BC'),(c2,p,'Sibling',3,'BC');
  insert into public.card_setups(id,parent_id,child_id,plan,price,workbook_welcome_enabled) values(k1,p,c1,'one',79.99,false),(k2,p,c2,'one',79.99,false);
  a:=public.admit_plan_start_terms(k1,1,k1::text,'pm_probe','initial',7999,'');
  update public.plan_starts set started_at=e-interval '720 hours' where card_setup_id=k1;
  perform public.finish_plan_start(k1,1,'started','sub_probe',e,false);
  if public.check_child_deletion(p,c1)<>'ready' then raise exception 'child deletion not ready'; end if;
  insert into public.child_deletions(child_id,parent_id) values(c1,p);
  if not public.claim_child_deletion(p,c1,token) or not public.complete_child_deletion(p,c1,token) then raise exception 'child deletion failed'; end if;
  if exists(select 1 from public.card_setups where id=k1) or exists(select 1 from public.plan_starts where card_setup_id=k1) then raise exception 'child data not deleted'; end if;
  b:=public.admit_family_plan_start(k2,1,k2::text,'pm_probe','initial',7999,'');
  if (b->>'monthly_cents')::int<>5999 or b->>'trial_end' is not null then raise exception 'DELETED_LEGACY_FIRST_CHILD_GOT_NEW_OFFER: %',b; end if;
  if not exists(select 1 from public.family_plan_windows where parent_id=p and first_child_id=c1 and ends_at=e and confirmed) then raise exception 'first owner or window lost'; end if;
  -- Family deletion still removes the durable pricing facts.
  delete from auth.users where id=p;
  if exists(select 1 from public.family_plan_windows where parent_id=p) or exists(select 1 from public.child_plan_prices where parent_id=p) then raise exception 'family pricing history survived family deletion'; end if;
end $$;
select 'LEGACY_CHILD_DELETION_HISTORY_OK' as result;
