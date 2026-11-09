-- Run inside BEGIN / ROLLBACK. Test live finalization and previously final legacy starts.
do $$
declare p uuid; c1 uuid; c2 uuid; k1 uuid; k2 uuid; outcome text; already_final boolean; a jsonb; b jsonb; e timestamptz:=now()+interval '20 days';
begin
  foreach outcome in array array['started','refused'] loop
    foreach already_final in array array[false,true] loop
      p:=gen_random_uuid(); c1:=gen_random_uuid(); c2:=gen_random_uuid(); k1:=gen_random_uuid(); k2:=gen_random_uuid();
      insert into auth.users(id,email) values(p,p::text||'@example.invalid');
      insert into public.parents(id,name,email) values(p,'Legacy settlement probe',p::text||'@example.invalid');
      insert into public.children(id,parent_id,first_name,grade,province) values(c1,p,'First',3,'BC'),(c2,p,'Sibling',3,'BC');
      insert into public.card_setups(id,parent_id,child_id,plan,price,workbook_welcome_enabled) values(k1,p,c1,'one',79.99,false),(k2,p,c2,'one',79.99,false);
      a:=public.admit_plan_start_terms(k1,1,k1::text,'pm_probe','initial',7999,'');
      if already_final then perform public.finish_plan_start(k1,1,outcome,case when outcome='started' then 'sub_probe' end,case when outcome='started' then e end,false); end if;
      insert into public.family_plan_windows(parent_id,first_child_id,start_key,started_at,ends_at) values(p,c1,k1::text,e-interval '720 hours',e);
      insert into public.child_plan_prices(parent_id,child_id,monthly_cents,start_key) values(p,c1,7999,k1::text);
      if not already_final then perform public.finish_plan_start(k1,1,outcome,case when outcome='started' then 'sub_probe' end,case when outcome='started' then e end,false); end if;
      b:=public.admit_family_plan_start(k2,1,k2::text,'pm_probe','initial',7999,'');
      if outcome='started' then
        if (b->>'monthly_cents')::int<>5999 or (b->>'trial_end')::timestamptz<>e then raise exception 'confirmed legacy terms lost'; end if;
        if not exists(select 1 from public.child_plan_prices where parent_id=p and child_id=c1 and confirmed and not released) then raise exception 'legacy child price not confirmed'; end if;
      else
        if (b->>'monthly_cents')::int<>7999 or (b->>'trial_end')::timestamptz<=now() then raise exception 'refused legacy offer not released'; end if;
        if not exists(select 1 from public.child_plan_prices where parent_id=p and child_id=c1 and released and not confirmed) then raise exception 'legacy child price not released'; end if;
      end if;
    end loop;
  end loop;
end $$;
select 'LEGACY_SETTLEMENT_FOUR_CASES_OK' as result;
