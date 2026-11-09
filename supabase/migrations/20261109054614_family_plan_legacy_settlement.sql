-- Settle only the exact reservation whose recorded legacy start is final.
-- Keep the deployed function bodies and their response contracts unchanged.
create function public.reconcile_family_plan_reservations(p_parent uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  update public.family_plan_windows w set confirmed=s.state in ('started','other'),released=s.state='refused'
  from public.plan_starts s join public.card_setups c on c.id=s.card_setup_id
  where w.parent_id=s.parent_id and w.first_child_id=c.child_id and w.start_key=s.start_key
    and not w.confirmed and not w.released and s.state in ('started','other','refused') and s.parent_id=p_parent;
  update public.child_plan_prices q set confirmed=s.state in ('started','other'),released=s.state='refused'
  from public.plan_starts s join public.card_setups c on c.id=s.card_setup_id
  where q.parent_id=s.parent_id and q.child_id=c.child_id and q.start_key=s.start_key
    and not q.confirmed and not q.released and s.state in ('started','other','refused') and s.parent_id=p_parent;
end $$;
revoke all on function public.reconcile_family_plan_reservations(uuid) from public,anon,authenticated,service_role;

create function public.settle_legacy_family_reservations() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform public.reconcile_family_plan_reservations(new.parent_id);
  return new;
end $$;
revoke all on function public.settle_legacy_family_reservations() from public,anon,authenticated,service_role;
create trigger settle_legacy_family_reservations after update of state on public.plan_starts
  for each row when (old.state='open' and new.state in ('started','other','refused'))
  execute function public.settle_legacy_family_reservations();

-- Repair only existing stuck reservations matched by parent, child and start key.
  update public.family_plan_windows w set confirmed=s.state in ('started','other'),released=s.state='refused'
  from public.plan_starts s join public.card_setups c on c.id=s.card_setup_id
  where w.parent_id=s.parent_id and w.first_child_id=c.child_id and w.start_key=s.start_key
    and not w.confirmed and not w.released and s.state in ('started','other','refused');
  update public.child_plan_prices q set confirmed=s.state in ('started','other'),released=s.state='refused'
  from public.plan_starts s join public.card_setups c on c.id=s.card_setup_id
  where q.parent_id=s.parent_id and q.child_id=c.child_id and q.start_key=s.start_key
    and not q.confirmed and not q.released and s.state in ('started','other','refused');

create or replace function public.seed_family_plan_history(p_parent uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform public.reconcile_family_plan_reservations(p_parent);
  with history as (
    select s.parent_id,c.child_id,s.start_key,s.started_at,
      case when s.purpose='initial' then coalesce(s.first_charge_at-interval '720 hours',s.started_at) end trial_start,
      s.state in ('started','other') confirmed
    from public.plan_starts s join public.card_setups c on c.id=s.card_setup_id
    where s.parent_id=p_parent and s.state in ('open','started','other')
    union all
    select s.parent_id,s.child_id,'legacy-state:'||s.child_id,s.event_at,null,true
    from public.child_plan_states s where s.parent_id=p_parent and s.kind<>'not_started'
      and not exists(select 1 from public.plan_starts p join public.card_setups c on c.id=p.card_setup_id
        where c.child_id=s.child_id and p.state in ('open','started','other'))
  ), firsts as (
    select distinct on(parent_id) * from history order by parent_id,started_at,child_id,start_key
  )
  insert into public.family_plan_windows(parent_id,first_child_id,start_key,started_at,ends_at,confirmed)
  select parent_id,child_id,start_key,trial_start,trial_start+interval '720 hours',confirmed from firsts
  on conflict(parent_id) do update set first_child_id=excluded.first_child_id,start_key=excluded.start_key,
    started_at=excluded.started_at,ends_at=excluded.ends_at,confirmed=excluded.confirmed,released=false
  where public.family_plan_windows.released;

  insert into public.child_plan_prices(parent_id,child_id,monthly_cents,start_key,confirmed)
  select c.parent_id,c.child_id,
    least(coalesce((select min(p.monthly_cents) from public.plan_starts p where p.card_setup_id=c.id and p.state in ('open','started','other')),
      nullif(s.monthly_cents,0),round(c.price*100)::integer),case when w.first_child_id=c.child_id then 7999 else 5999 end),
    coalesce((select p.start_key from public.plan_starts p where p.card_setup_id=c.id and p.state in ('open','started','other') order by p.started_at,p.generation limit 1),'legacy-state:'||c.child_id),
    exists(select 1 from public.plan_starts p where p.card_setup_id=c.id and p.state in ('started','other')) or coalesce(s.kind<>'not_started',false)
  from public.card_setups c join public.family_plan_windows w on w.parent_id=c.parent_id and not w.released
  left join public.child_plan_states s on s.child_id=c.child_id
  where c.parent_id=p_parent and (coalesce(s.kind<>'not_started',false) or exists(select 1 from public.plan_starts p where p.card_setup_id=c.id and p.state in ('open','started','other')))
  on conflict(parent_id,child_id) do update set monthly_cents=excluded.monthly_cents,start_key=excluded.start_key,confirmed=excluded.confirmed,released=false
  where public.child_plan_prices.released;
  -- A legacy caller could ignore the first migration's absolute end. Before any new sibling is admitted,
  -- align the family record with the first plan's actual, immutable first-charge receipt.
  update public.family_plan_windows w set started_at=s.first_charge_at-interval '720 hours',ends_at=s.first_charge_at
  from public.plan_starts s join public.card_setups c on c.id=s.card_setup_id
  where w.parent_id=p_parent and s.parent_id=p_parent and w.first_child_id=c.child_id and w.start_key=s.start_key
    and w.confirmed and not w.released and s.state='started' and s.purpose='initial' and s.first_charge_at is not null
    and w.ends_at is distinct from s.first_charge_at
    and not exists(select 1 from public.plan_starts x join public.card_setups k on k.id=x.card_setup_id
      where x.parent_id=p_parent and x.family_terms and k.child_id<>w.first_child_id and x.state in ('open','started','other'));

end $$;
