-- Run only after the migration, inside the caller's BEGIN / ROLLBACK block.
-- Synthetic rows never commit. No Stripe command or email is dispatched.
do $$
declare p uuid:=gen_random_uuid(); c1 uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid(); k1 uuid:=gen_random_uuid(); k2 uuid:=gen_random_uuid(); a jsonb; b jsonb;
begin
  insert into auth.users(id,email) values(p,p::text||'@example.invalid');
  insert into public.parents(id,name,email) values(p,'Family pricing SQL probe',p::text||'@example.invalid');
  insert into public.children(id,parent_id,first_name,grade,province) values(c1,p,'First',3,'BC'),(c2,p,'Sibling',3,'BC');
  insert into public.card_setups(id,parent_id,child_id,plan,price,workbook_welcome_enabled) values(k1,p,c1,'one',79.99,false),(k2,p,c2,'one',79.99,false);
  a:=public.admit_family_plan_start(k1,1,gen_random_uuid()::text,'pm_synthetic','initial',7999,'');
  if (a->>'monthly_cents')::int<>7999 or a->>'trial_end' is null then raise exception 'first admission failed'; end if;
  begin
    perform public.admit_family_plan_start(k2,1,gen_random_uuid()::text,'pm_synthetic','initial',7999,'');
    raise exception 'uncertain first start admitted a sibling';
  exception when sqlstate '55000' then
    if sqlerrm<>'family_start_pending' then raise; end if;
  end;
  perform public.finish_plan_start(k1,1,'started','sub_synthetic', (a->>'trial_end')::timestamptz,false);
  b:=public.admit_family_plan_start(k2,1,gen_random_uuid()::text,'pm_synthetic','initial',7999,'');
  if (b->>'monthly_cents')::int<>5999 or b->>'trial_end' is distinct from a->>'trial_end' then raise exception 'sibling admission failed'; end if;
  perform public.finish_plan_start(k2,1,'started','sub_synthetic_sibling',(b->>'trial_end')::timestamptz,false);
  b:=public.admit_family_plan_start(k2,2,gen_random_uuid()::text,'pm_synthetic','restart',7999,'');
  if (b->>'monthly_cents')::int<>5999 or b->>'trial_end' is not null then raise exception 'Restart admission failed'; end if;
  if has_function_privilege('anon','public.admit_family_plan_start(uuid,integer,text,text,text,integer,text)','execute')
    or has_function_privilege('authenticated','public.admit_family_plan_start(uuid,integer,text,text,text,integer,text)','execute') then raise exception 'public admission grant'; end if;
end $$;
select 'FAMILY_PLAN_PRICING_ROLLBACK_PROBE_OK' as result;
