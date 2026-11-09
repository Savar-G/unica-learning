-- Reproduce a first start made by main while the first PR B migration was active.
-- Main's relative Stripe trial ended after the migration's whole-second metadata end.
do $$
declare p uuid:=gen_random_uuid(); c1 uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid(); k1 uuid:=gen_random_uuid(); k2 uuid:=gen_random_uuid(); a jsonb; b jsonb; metadata_end timestamptz; actual_end timestamptz;
begin
  insert into auth.users(id,email) values(p,p::text||'@example.invalid');
  insert into public.parents(id,name,email) values(p,'Legacy window probe',p::text||'@example.invalid');
  insert into public.children(id,parent_id,first_name,grade,province) values(c1,p,'First',3,'BC'),(c2,p,'Sibling',3,'BC');
  insert into public.card_setups(id,parent_id,child_id,plan,price,workbook_welcome_enabled) values(k1,p,c1,'one',79.99,false),(k2,p,c2,'one',79.99,false);
  a:=public.admit_plan_start_terms(k1,1,k1::text,'pm_probe','initial',7999,'');
  metadata_end:=date_trunc('second',(a->>'at')::timestamptz)+interval '720 hours'; actual_end:=metadata_end+interval '5 seconds';
  insert into public.family_plan_windows(parent_id,first_child_id,start_key,started_at,ends_at) values(p,c1,k1::text,metadata_end-interval '720 hours',metadata_end);
  insert into public.child_plan_prices(parent_id,child_id,monthly_cents,start_key) values(p,c1,7999,k1::text);
  update public.plan_starts set family_terms=true,trial_end=metadata_end where card_setup_id=k1 and generation=1;
  perform public.finish_plan_start(k1,1,'started','sub_probe',actual_end,false);
  b:=public.admit_family_plan_start(k2,1,k2::text,'pm_probe','initial',7999,'');
  if (b->>'trial_end')::timestamptz<>actual_end then raise exception 'LEGACY_WINDOW_DOES_NOT_MATCH_FIRST_CHARGE'; end if;
  if (b->>'monthly_cents')::int<>5999 then raise exception 'legacy sibling price wrong'; end if;
end $$;
select 'LEGACY_WINDOW_MATCHES_FIRST_CHARGE_OK' as result;
