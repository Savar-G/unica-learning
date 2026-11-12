-- This helper runs only from PR B's new admission. The deployed legacy call shape does not call it.
-- Import starts made on main after the first schema migration. Do not create another family window.
create function public.seed_family_plan_history(p_parent uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
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
end $$;
revoke all on function public.seed_family_plan_history(uuid) from public,anon,authenticated,service_role;

create or replace function public.admit_family_plan_start(p_card uuid,p_generation integer,p_key text,p_payment_method text,p_purpose text,p_monthly_cents integer,p_revision text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid; p uuid; last public.plan_starts; control public.child_plan_controls; w public.family_plan_windows; amount integer; trial timestamptz; at_time timestamptz;
begin
  select child_id,parent_id into c,p from public.card_setups where id=p_card;
  if c is null then raise exception 'plan_start_no_card_setup'; end if;
  -- Take this before any shared parent/child lock. All starts and resolutions use the same order.
  perform 1 from public.parents where id=p for update;
  perform public.plan_control_owner(p,p_card);
  if exists(select 1 from public.plan_control_operations where child_id=c and state='open') then raise exception 'plan_control_pending' using errcode='55000'; end if;
  select * into control from public.child_plan_controls where child_id=c;
  select * into last from public.plan_starts where card_setup_id=p_card order by generation desc limit 1;
  if p_purpose is null or p_purpose not in ('initial','restart') or p_monthly_cents is null or p_monthly_cents<=0 or p_generation is null or p_generation<1 then raise exception 'invalid_start_terms'; end if;
  if (last.generation is not null and last.generation>=p_generation) or last.state='open' then
    if last.purpose<>p_purpose then raise exception 'restart_required' using errcode='55000'; end if;
    return public.family_plan_start_answer(last,false);
  end if;
  if p_purpose='initial' and (control.cancelled or exists(select 1 from public.plan_starts where card_setup_id=p_card and state in ('started','other'))) then
    raise exception 'restart_required' using errcode='55000';
  end if;
  if p_purpose='restart' and coalesce(control.revision::text,'')<>p_revision then raise exception 'stale_restart' using errcode='55000'; end if;
  if coalesce(last.generation,0)<>p_generation-1 then raise exception 'plan_start_generation_gap'; end if;
  perform public.seed_family_plan_history(p);
  select * into w from public.family_plan_windows where parent_id=p and not released;
  if found and not w.confirmed then raise exception 'family_start_pending' using errcode='55000'; end if;
  at_time:=date_trunc('second',clock_timestamp());
  if w.parent_id is null then
    insert into public.family_plan_windows(parent_id,first_child_id,start_key,started_at,ends_at)
      values(p,c,p_key,case when p_purpose='initial' then at_time end,case when p_purpose='initial' then at_time+interval '720 hours' end)
      on conflict(parent_id) do update set first_child_id=excluded.first_child_id,start_key=excluded.start_key,
        started_at=excluded.started_at,ends_at=excluded.ends_at,confirmed=false,released=false
      returning * into w;
  end if;
  amount:=public.family_plan_price(p,p_card,p_monthly_cents);
  trial:=case when p_purpose='initial' and w.ends_at>at_time then w.ends_at end;
  insert into public.child_plan_prices(parent_id,child_id,monthly_cents,start_key)
    values(p,c,amount,p_key)
    on conflict(parent_id,child_id) do update set monthly_cents=case when public.child_plan_prices.released then excluded.monthly_cents else least(public.child_plan_prices.monthly_cents,excluded.monthly_cents) end,
      start_key=case when public.child_plan_prices.confirmed then public.child_plan_prices.start_key else excluded.start_key end,
      released=false;
  insert into public.child_card_updates(child_id,parent_id) values(c,p) on conflict(child_id) do nothing;
  perform 1 from public.child_card_updates where child_id=c for update;
  insert into public.plan_starts(card_setup_id,generation,parent_id,start_key,payment_method_id,purpose,monthly_cents,started_at,family_terms,trial_end)
    values(p_card,p_generation,p,p_key,p_payment_method,p_purpose,amount,at_time,true,trial) returning * into last;
  return public.family_plan_start_answer(last,true);
end $$;

-- This read also recognizes legacy history before the first PR B admission imports it.
create or replace function public.family_plan_price(p_parent uuid,p_card uuid,p_agreed_cents integer) returns integer
language sql stable security definer set search_path='' as $$
  select least(p_agreed_cents,
    (select monthly_cents from public.child_plan_prices where parent_id=p_parent and child_id=c.child_id and not released),
    (select min(s.monthly_cents) from public.plan_starts s where s.parent_id=p_parent and s.card_setup_id=p_card and s.state in ('open','started','other')),
    case when coalesce((select first_child_id from public.family_plan_windows where parent_id=p_parent and not released),
      (select h.child_id from (
        select k.child_id,s.started_at from public.plan_starts s join public.card_setups k on k.id=s.card_setup_id
          where s.parent_id=p_parent and s.state in ('open','started','other')
        union all
        select child_id,event_at from public.child_plan_states where parent_id=p_parent and kind<>'not_started'
          and not exists(select 1 from public.plan_starts x join public.card_setups k on k.id=x.card_setup_id where k.child_id=child_plan_states.child_id and x.state in ('open','started','other'))
      ) h order by h.started_at,h.child_id limit 1),c.child_id)<>c.child_id then 5999 else 7999 end)
  from public.card_setups c where c.id=p_card and c.parent_id=p_parent;
$$;
