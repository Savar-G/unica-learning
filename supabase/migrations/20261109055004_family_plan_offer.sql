-- Read the family offer before a child has a saved card. Only PR B calls this function.
create function public.family_plan_offer(p_parent uuid,p_child uuid,p_agreed_cents integer) returns jsonb
language sql stable security definer set search_path='' as $$
  with history as (
    select c.child_id,s.started_at,
      case when s.purpose='initial' then coalesce(s.first_charge_at,s.started_at+interval '720 hours') end ends_at,
      s.state in ('started','other') confirmed
    from public.plan_starts s join public.card_setups c on c.id=s.card_setup_id
    where s.parent_id=p_parent and s.state in ('open','started','other')
    union all
    select s.child_id,s.event_at,null,true from public.child_plan_states s
    where s.parent_id=p_parent and s.kind<>'not_started'
      and not exists(select 1 from public.plan_starts x join public.card_setups c on c.id=x.card_setup_id
        where x.parent_id=p_parent and c.child_id=s.child_id and x.state in ('open','started','other'))
  ), first_history as (
    select * from history order by started_at,child_id limit 1
  ), windows as (
    select w.first_child_id child_id,w.started_at,
      case when s.state='started' and s.purpose='initial' and s.first_charge_at is not null
        and not exists(select 1 from public.plan_starts x join public.card_setups k on k.id=x.card_setup_id
          where x.parent_id=p_parent and x.family_terms and k.child_id<>w.first_child_id and x.state in ('open','started','other'))
        then s.first_charge_at else w.ends_at end ends_at,
      w.confirmed or coalesce(s.state in ('started','other'),false) confirmed,0 priority
    from public.family_plan_windows w
    left join (public.plan_starts s join public.card_setups c on c.id=s.card_setup_id)
      on s.parent_id=w.parent_id and s.start_key=w.start_key and c.child_id=w.first_child_id
    where w.parent_id=p_parent and not w.released and coalesce(s.state<>'refused',true)
    union all select child_id,started_at,ends_at,confirmed,1 from first_history
  ), chosen as (
    select * from windows order by priority limit 1
  )
  select jsonb_build_object('monthly_cents',least(p_agreed_cents,
    coalesce((select round(price*100)::integer from public.card_setups where parent_id=p_parent and child_id=p_child),p_agreed_cents),
    coalesce((select monthly_cents from public.child_plan_prices where parent_id=p_parent and child_id=p_child and not released),p_agreed_cents),
    coalesce((select min(s.monthly_cents) from public.plan_starts s join public.card_setups c on c.id=s.card_setup_id
      where s.parent_id=p_parent and c.child_id=p_child and s.state in ('open','started','other')),p_agreed_cents),
    case when exists(select 1 from chosen where child_id<>p_child) then 5999 else 7999 end),
    'window',case when not exists(select 1 from chosen) then 'new'
      when not (select confirmed from chosen) then 'unknown'
      when (select ends_at from chosen)>now() then 'open' else 'ended' end)
  where p_agreed_cents>0 and exists(select 1 from public.children where id=p_child and parent_id=p_parent);
$$;
revoke all on function public.family_plan_offer(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.family_plan_offer(uuid,uuid,integer) to service_role;
