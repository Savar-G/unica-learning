-- The offer is read before a card exists. It must use the same family history as admission.
do $$
declare p uuid:=gen_random_uuid(); c1 uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid(); c3 uuid:=gen_random_uuid(); k uuid:=gen_random_uuid(); offer jsonb; a jsonb; e timestamptz:=now()+interval '20 days';
begin
  insert into auth.users(id,email) values(p,p::text||'@example.invalid');
  insert into public.parents(id,name,email) values(p,'Family offer probe',p::text||'@example.invalid');
  insert into public.children(id,parent_id,first_name,grade,province) values(c1,p,'First',3,'BC'),(c2,p,'Sibling',3,'BC'),(c3,p,'Late sibling',3,'BC');
  offer:=public.family_plan_offer(p,c1,7999);
  if offer->>'window'<>'new' or (offer->>'monthly_cents')::int<>7999 then raise exception 'first offer wrong'; end if;
  insert into public.card_setups(id,parent_id,child_id,plan,price,workbook_welcome_enabled) values(k,p,c1,'one',79.99,false);
  a:=public.admit_plan_start_terms(k,1,k::text,'pm_probe','initial',7999,'');
  update public.plan_starts set started_at=e-interval '720 hours' where card_setup_id=k;
  offer:=public.family_plan_offer(p,c2,7999);
  if offer->>'window'<>'unknown' then raise exception 'uncertain first offer promised'; end if;
  perform public.finish_plan_start(k,1,'started','sub_probe',e,false);
  offer:=public.family_plan_offer(p,c2,7999);
  if offer->>'window'<>'open' or (offer->>'monthly_cents')::int<>5999 then raise exception 'open sibling offer wrong'; end if;
  if (public.family_plan_offer(p,c2,4900)->>'monthly_cents')::int<>4900 then raise exception 'older lower offer raised'; end if;
  update public.plan_starts set started_at=now()-interval '31 days',first_charge_at=now()-interval '1 day' where card_setup_id=k;
  offer:=public.family_plan_offer(p,c3,7999);
  if offer->>'window'<>'ended' or (offer->>'monthly_cents')::int<>5999 then raise exception 'late sibling offer wrong'; end if;
  delete from public.children where id=c1;
  offer:=public.family_plan_offer(p,c3,7999);
  if offer->>'window'<>'ended' or (offer->>'monthly_cents')::int<>5999 then raise exception 'deleted first child offer wrong'; end if;
  if public.family_plan_offer(gen_random_uuid(),c3,7999) is not null then raise exception 'cross-family offer exposed'; end if;
end $$;
select 'FAMILY_PLAN_OFFER_OK' as result;
