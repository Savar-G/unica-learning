-- Run the setup, then the migration, then the assertions in one rolled-back transaction.
create temp table legacy_stuck_probe(parent_id uuid,child_id uuid,outcome text) on commit drop;
do $$
declare p uuid; c uuid; k uuid; outcome text;
begin
  foreach outcome in array array['started','refused'] loop
    p:=gen_random_uuid(); c:=gen_random_uuid(); k:=gen_random_uuid();
    insert into auth.users(id,email) values(p,p::text||'@example.invalid');
    insert into public.parents(id,name,email) values(p,'Stuck backfill probe',p::text||'@example.invalid');
    insert into public.children(id,parent_id,first_name,grade,province) values(c,p,'First',3,'BC');
    insert into public.card_setups(id,parent_id,child_id,plan,price,workbook_welcome_enabled) values(k,p,c,'one',79.99,false);
    perform public.admit_plan_start_terms(k,1,k::text,'pm_probe','initial',7999,'');
    perform public.finish_plan_start(k,1,outcome,case when outcome='started' then 'sub_probe' end,case when outcome='started' then now()+interval '30 days' end,false);
    insert into public.family_plan_windows(parent_id,first_child_id,start_key,started_at,ends_at) values(p,c,k::text,now(),now()+interval '720 hours');
    insert into public.child_plan_prices(parent_id,child_id,monthly_cents,start_key) values(p,c,7999,k::text);
    insert into legacy_stuck_probe values(p,c,outcome);
  end loop;
end $$;
-- APPLY_MIGRATION_HERE

do $$
begin
  if exists(select 1 from legacy_stuck_probe p join public.family_plan_windows w using(parent_id)
    join public.child_plan_prices q using(parent_id,child_id)
    where w.confirmed<>(p.outcome='started') or w.released<>(p.outcome='refused')
      or q.confirmed<>(p.outcome='started') or q.released<>(p.outcome='refused')) then raise exception 'LEGACY_STUCK_BACKFILL_FAILED'; end if;
end $$;
select 'LEGACY_STUCK_BACKFILL_TWO_CASES_OK' as result;
