-- Family admission owns price and trial together. Child UUIDs deliberately have no child/card foreign key:
-- deleting a child cannot erase the family's first owner, consumed window or admitted sibling price.
create table public.family_plan_windows (
  parent_id uuid primary key references public.parents(id) on delete cascade,
  first_child_id uuid not null,
  start_key text not null,
  started_at timestamptz,
  ends_at timestamptz,
  confirmed boolean not null default false,
  released boolean not null default false,
  check ((started_at is null) = (ends_at is null)),
  check (ends_at is null or ends_at = started_at + interval '720 hours')
);
create table public.child_plan_prices (
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null,
  monthly_cents integer not null check (monthly_cents > 0),
  start_key text not null,
  confirmed boolean not null default false,
  released boolean not null default false,
  primary key(parent_id,child_id)
);
alter table public.plan_starts
  add column family_terms boolean not null default false,
  add column trial_end timestamptz;

alter table public.family_plan_windows enable row level security;
alter table public.child_plan_prices enable row level security;
revoke all on public.family_plan_windows,public.child_plan_prices from public,anon,authenticated,service_role;
grant select on public.family_plan_windows,public.child_plan_prices to service_role;

-- Preserve known pre-upgrade history. A provider state without an exact start has no invented trial dates.
-- A known open start reserves the family until matching recovery or confirmed refusal resolves it.
with history as (
  select s.parent_id,c.child_id,s.start_key,s.started_at,
    case when s.purpose='restart' then null else s.started_at end trial_start,
    s.state in ('started','other') confirmed
  from public.plan_starts s join public.card_setups c on c.id=s.card_setup_id
  where s.state in ('open','started','other')
  union all
  select s.parent_id,s.child_id,'legacy-state:'||s.child_id,s.event_at,null,true
  from public.child_plan_states s where s.kind<>'not_started'
    and not exists(select 1 from public.plan_starts p join public.card_setups c on c.id=p.card_setup_id
      where c.child_id=s.child_id and p.state in ('open','started','other'))
), firsts as (
  select distinct on(parent_id) * from history order by parent_id,started_at,child_id,start_key
)
insert into public.family_plan_windows(parent_id,first_child_id,start_key,started_at,ends_at,confirmed)
select parent_id,child_id,start_key,trial_start,trial_start+interval '720 hours',confirmed from firsts;

insert into public.child_plan_prices(parent_id,child_id,monthly_cents,start_key,confirmed)
select c.parent_id,c.child_id,
  least(coalesce((select min(p.monthly_cents) from public.plan_starts p where p.card_setup_id=c.id and p.state in ('open','started','other')),
    nullif(s.monthly_cents,0),round(c.price*100)::integer),
    case when w.first_child_id=c.child_id then 7999 else 5999 end),
  coalesce((select p.start_key from public.plan_starts p where p.card_setup_id=c.id and p.state in ('open','started','other') order by p.started_at,p.generation limit 1),'legacy-state:'||c.child_id),
  exists(select 1 from public.plan_starts p where p.card_setup_id=c.id and p.state in ('started','other')) or coalesce(s.kind<>'not_started',false)
from public.card_setups c join public.family_plan_windows w on w.parent_id=c.parent_id
left join public.child_plan_states s on s.child_id=c.child_id
where coalesce(s.kind<>'not_started',false) or exists(select 1 from public.plan_starts p where p.card_setup_id=c.id and p.state in ('open','started','other'));

-- A read for Restart confirmation. Admission repeats this rule under the parent lock.
create function public.family_plan_price(p_parent uuid,p_card uuid,p_agreed_cents integer) returns integer
language sql stable security definer set search_path='' as $$
  select least(p_agreed_cents,coalesce((select monthly_cents from public.child_plan_prices where parent_id=p_parent and child_id=c.child_id and not released),
    case when exists(select 1 from public.family_plan_windows where parent_id=p_parent and not released and first_child_id<>c.child_id) then 5999 else 7999 end))
  from public.card_setups c where c.id=p_card and c.parent_id=p_parent;
$$;

create or replace function public.plan_start_terms(p_card uuid,p_generation integer) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('purpose',purpose,'monthly_cents',monthly_cents,'family_terms',family_terms,'trial_end',trial_end)
 from public.plan_starts where card_setup_id=p_card and generation=p_generation;
$$;
create or replace function public.plan_start_answer(p_row public.plan_starts,p_admitted boolean) returns jsonb
language sql immutable security definer set search_path='' as $$
 select jsonb_build_object('admitted',p_admitted,'generation',p_row.generation,'key',p_row.start_key,'card',p_row.payment_method_id,
 'at',p_row.started_at,'state',p_row.state,'subscription',p_row.subscription_id,'first_charge',p_row.first_charge_at,
 'finished_at',p_row.finished_at,'email',p_row.email_state,'alert',p_row.team_alert_state,'purpose',p_row.purpose,'monthly_cents',p_row.monthly_cents,
 'family_terms',p_row.family_terms,'trial_end',p_row.trial_end);
$$;

create function public.admit_family_plan_start(p_card uuid,p_generation integer,p_key text,p_payment_method text,p_purpose text,p_monthly_cents integer,p_revision text default '') returns jsonb
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
    return public.plan_start_answer(last,false);
  end if;
  if p_purpose='initial' and (control.cancelled or exists(select 1 from public.plan_starts where card_setup_id=p_card and state in ('started','other'))) then
    raise exception 'restart_required' using errcode='55000';
  end if;
  if p_purpose='restart' and coalesce(control.revision::text,'')<>p_revision then raise exception 'stale_restart' using errcode='55000'; end if;
  if coalesce(last.generation,0)<>p_generation-1 then raise exception 'plan_start_generation_gap'; end if;
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
  return public.plan_start_answer(last,true);
end $$;

-- Older deployments send their own price and relative trial. Preserve the first full-window start and paid Restart
-- only when their payload still matches admission. Refuse a sibling or shortened-window start before it can charge wrong terms.
create or replace function public.admit_plan_start_terms(p_card uuid,p_generation integer,p_key text,p_payment_method text,p_purpose text,p_monthly_cents integer,p_revision text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare answer jsonb;
begin
  answer:=public.admit_family_plan_start(p_card,p_generation,p_key,p_payment_method,p_purpose,p_monthly_cents,p_revision);
  if (answer->>'monthly_cents')::integer is distinct from p_monthly_cents
    or (p_purpose='initial' and (answer->>'trial_end')::timestamptz is distinct from (answer->>'at')::timestamptz+interval '720 hours') then
    raise exception 'family_plan_upgrade_required' using errcode='55000';
  end if;
  return answer;
end $$;

create or replace function public.finish_plan_start(p_card uuid,p_generation integer,p_state text,p_subscription text,p_first_charge timestamptz,p_email boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare p uuid; c uuid; k text;
begin
  if p_state not in ('started','other','refused') then raise exception 'plan_start_bad_state' using errcode='22023'; end if;
  select parent_id,start_key into p,k from public.plan_starts where card_setup_id=p_card and generation=p_generation;
  if not found then return false; end if;
  perform 1 from public.parents where id=p for update;
  update public.plan_starts set state=p_state,finished_at=now(),subscription_id=p_subscription,first_charge_at=p_first_charge,
    email_state=case when p_state='started' and p_email then 'pending' else 'none' end
    where card_setup_id=p_card and generation=p_generation and state='open';
  if not found then return false; end if;
  select child_id into c from public.card_setups where id=p_card;
  if p_state='refused' then
    update public.family_plan_windows set released=true where parent_id=p and start_key=k and not confirmed;
    update public.child_plan_prices set released=true where parent_id=p and child_id=c and start_key=k and not confirmed;
  else
    update public.family_plan_windows set confirmed=true where parent_id=p and start_key=k and not released;
    update public.child_plan_prices set confirmed=true where parent_id=p and child_id=c and not released;
  end if;
  return true;
end $$;

revoke all on function public.family_plan_price(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.admit_family_plan_start(uuid,integer,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.family_plan_price(uuid,uuid,integer) to service_role;
grant execute on function public.admit_family_plan_start(uuid,integer,text,text,text,integer,text) to service_role;
