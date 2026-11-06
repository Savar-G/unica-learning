-- #559 / #546. Additive. No hosted action occurs until a server calls a function.
-- All new state is private. A pending provider command has a durable family hold with no expiry.
create table public.child_plan_controls (
  child_id uuid primary key references public.children(id) on delete cascade,
  parent_id uuid not null references public.parents(id) on delete cascade,
  cancelled boolean not null default false,
  revision uuid,
  foreign key(child_id,parent_id) references public.children(id,parent_id) on delete cascade
);
create table public.plan_control_operations (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  card_setup_id uuid not null references public.card_setups(id) on delete cascade,
  kind text not null check(kind in ('pause','cancel')),
  token text not null check(char_length(token) between 1 and 255),
  state text not null default 'open' check(state in ('open','applied','refused')),
  quote jsonb not null default '{}'::jsonb,
  weeks integer not null default 0 check(weeks between 0 and 8),
  allowance_year integer,
  target_number integer,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  -- Retire the mailing effect at a plan boundary. Keep the row for the yearly allowance.
  mailing_retired_at timestamptz,
  unique(card_setup_id,kind,token),
  foreign key(child_id,parent_id) references public.children(id,parent_id) on delete cascade,
  check((kind='pause' and weeks>0 and allowance_year is not null and target_number>0) or (kind='cancel' and weeks=0)),
  check((state='open')=(finished_at is null))
);
create index plan_controls_parent on public.child_plan_controls(parent_id);
create index plan_control_child_year on public.plan_control_operations(child_id,allowance_year);
create index plan_control_parent on public.plan_control_operations(parent_id);
create unique index plan_control_one_open on public.plan_control_operations(child_id) where state='open';
create table public.workbook_restart_requests (
  card_setup_id uuid not null references public.card_setups(id) on delete cascade,
  generation integer not null,
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  requested_at timestamptz not null default now(),
  run_id uuid references public.workbook_runs(id) on delete set null,
  primary key(card_setup_id,generation),
  foreign key(card_setup_id,generation) references public.plan_starts(card_setup_id,generation) on delete cascade,
  foreign key(child_id,parent_id) references public.children(id,parent_id) on delete cascade
);
create index workbook_restart_child on public.workbook_restart_requests(child_id);
-- Existing initial records retain their meaning. The admitted terms are immutable across retries.
alter table public.plan_starts add column purpose text not null default 'initial' check(purpose in ('initial','restart')),
  add column monthly_cents integer check(monthly_cents>=0);

do $$ declare t text; begin
  foreach t in array array['child_plan_controls','plan_control_operations','workbook_restart_requests'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
    execute format('grant select on public.%I to service_role',t);
    execute format('create trigger fence_family_write before insert or update on public.%I for each row execute function public.fence_family_write()',t);
    execute format('create trigger fence_child_delete_write before insert or update on public.%I for each row execute function public.fence_child_delete_write()',t);
  end loop;
end $$;

create function public.plan_control_owner(p_parent uuid,p_card uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare c uuid;
begin
  perform public.assert_family_writable(p_parent);
  select child_id into c from public.card_setups where id=p_card and parent_id=p_parent;
  if not found then return null; end if;
  perform 1 from public.children where id=c and parent_id=p_parent for no key update;
  if exists(select 1 from public.child_deletions where child_id=c)
    or exists(select 1 from public.family_delete_holds where parent_id=p_parent and lease_until>clock_timestamp()) then
    raise exception 'family_unavailable' using errcode='55000';
  end if;
  return c;
end $$;

create function public.plan_control_context(p_parent uuid,p_card uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid; b record; d timestamptz;
begin
  select child_id into c from public.card_setups where id=p_card and parent_id=p_parent;
  if not found then return null; end if;
  if exists(select 1 from public.child_deletions where child_id=c)
    or exists(select 1 from public.parents where id=p_parent and deletion_requested_at is not null) then return null; end if;
  select id,number,shipped_at into b from public.workbooks where child_id=c and status='shipped' order by number desc limit 1;
  if b.id is not null then
    select coalesce((select x.delivered_at from public.workbook_delivery_corrections x where x.workbook_id=b.id order by x.audit_id desc limit 1),r.delivered_at)
      into d from public.workbook_delivery_receipts r where r.workbook_id=b.id;
  end if;
  return jsonb_build_object(
    'pendingKind',coalesce((select kind from public.plan_control_operations where child_id=c and state='open' limit 1),
      (select case when purpose='restart' then 'restart' else 'start' end from public.plan_starts where card_setup_id=p_card and state='open' limit 1)),
    'child',c,'revision',(select revision from public.child_plan_controls where child_id=c),
    'cancelled',coalesce((select cancelled from public.child_plan_controls where child_id=c),false),
    'family',(select jsonb_build_object('timeZone',time_zone,'postal',postal) from public.parents where id=p_parent),
    'province',(select province from public.children where parent_id=p_parent order by created_at,id limit 1),
    'firstDelivered',exists(select 1 from public.workbook_delivery_receipts where child_id=c),
    'book',case when b.id is null then null else jsonb_build_object('id',b.id,'number',b.number,'shippedAt',b.shipped_at,'deliveredAt',d) end,
    'pauses',coalesce((select jsonb_agg(jsonb_build_object('year',allowance_year,'weeks',weeks,'targetNumber',target_number,'quote',quote,'state',state,'token',token,'retired',mailing_retired_at is not null) order by created_at,id) from public.plan_control_operations where child_id=c and kind='pause' and state<>'refused'),'[]'::jsonb),
    'blocked',exists(select 1 from public.plan_control_operations where child_id=c and state='open')
      or exists(select 1 from public.plan_starts where card_setup_id=p_card and state='open')
  );
end $$;

create function public.plan_control_operation(p_parent uuid,p_card uuid,p_token text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',o.id,'state',o.state,'quote',o.quote,'send',false)
 from public.plan_control_operations o join public.card_setups c on c.id=o.card_setup_id
 where o.card_setup_id=p_card and c.parent_id=p_parent and o.parent_id=p_parent and o.token=p_token and o.kind='pause';
$$;

create function public.admit_plan_pause(p_parent uuid,p_card uuid,p_token text,p_quote jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid; o public.plan_control_operations; ctx jsonb; today date; shipped date; y int; used int; w int; target int;
begin
  c:=public.plan_control_owner(p_parent,p_card);
  if c is null then return null; end if;
  select * into o from public.plan_control_operations where card_setup_id=p_card and kind='pause' and token=p_token;
  if found then return jsonb_build_object('id',o.id,'state',o.state,'quote',o.quote,'send',false); end if;
  ctx:=public.plan_control_context(p_parent,p_card);
  if (ctx->>'blocked')::boolean or (ctx->>'cancelled')::boolean or not (ctx->>'firstDelivered')::boolean then return null; end if;
  select period into today from public._maya_family_window(p_parent,'day',clock_timestamp());
  select period into shipped from public._maya_family_window(p_parent,'day',(ctx->'book'->>'shippedAt')::timestamptz);
  y:=extract(year from today); w:=(p_quote->>'weeks')::int;
  select coalesce(sum(weeks),0) into used from public.plan_control_operations where child_id=c and allowance_year=y and state<>'refused';
  target:=(ctx->'book'->>'number')::int + case when today<=shipped+9 then 1 else 2 end;
  if p_quote->'location' is distinct from ((ctx->'family') || jsonb_build_object('province',ctx->'province')) then return null; end if;
  if w not between 1 and 8 or used+w>8 or p_quote->>'today'<>today::text or (p_quote->>'year')::int<>y
    or (p_quote->>'used')::int<>used or p_quote->>'bookId' is distinct from ctx->'book'->>'id'
    or (p_quote->>'shippedAt')::timestamptz is distinct from (ctx->'book'->>'shippedAt')::timestamptz
    or (p_quote->>'deliveredAt')::timestamptz is distinct from (ctx->'book'->>'deliveredAt')::timestamptz
    or (p_quote->>'targetNumber')::int<>target then return null; end if;
  insert into public.plan_control_operations(parent_id,child_id,card_setup_id,kind,token,quote,weeks,allowance_year,target_number)
    values(p_parent,c,p_card,'pause',p_token,p_quote,w,y,target) returning * into o;
  insert into public.family_card_operations(id,parent_id) values(o.id,p_parent);
  insert into public.child_plan_controls(child_id,parent_id,revision) values(c,p_parent,o.id)
    on conflict(child_id) do update set revision=excluded.revision;
  return jsonb_build_object('id',o.id,'state',o.state,'quote',o.quote,'send',true);
end $$;

create function public.finish_plan_control(p_id uuid,p_state text) returns void
language plpgsql security definer set search_path='' as $$
declare p uuid; c uuid;
begin
  select parent_id,child_id into p,c from public.plan_control_operations where id=p_id;
  if not found then return; end if;
  perform public.assert_family_writable(p);
  perform 1 from public.children where id=c for no key update;
  if p_state not in ('applied','refused') then raise exception 'invalid_state'; end if;
  update public.plan_control_operations set state=p_state,finished_at=clock_timestamp() where id=p_id and state='open';
  if found then
    if p_state='applied' and exists(select 1 from public.plan_control_operations where id=p_id and kind='cancel') then
      update public.child_plan_controls set cancelled=true where child_id=c;
      update public.plan_control_operations set mailing_retired_at=clock_timestamp()
        where child_id=c and kind='pause' and mailing_retired_at is null;
    end if;
    delete from public.family_card_operations where id=p_id;
  end if;
end $$;

-- Cancel owns the same admission lock as Pause and Restart. An unresolved command refuses cancellation.
-- Its family hold remains through any lost release/cancel response.
create function public.admit_plan_cancel(p_parent uuid,p_card uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare c uuid; o uuid;
begin
  c:=public.plan_control_owner(p_parent,p_card);
  if c is null then return null; end if;
  if exists(select 1 from public.plan_control_operations where child_id=c and state='open')
    or exists(select 1 from public.plan_starts where card_setup_id=p_card and state='open') then return null; end if;
  insert into public.plan_control_operations(parent_id,child_id,card_setup_id,kind,token)
    values(p_parent,c,p_card,'cancel',gen_random_uuid()::text) returning id into o;
  insert into public.family_card_operations(id,parent_id) values(o,p_parent);
  insert into public.child_plan_controls(child_id,parent_id,revision) values(c,p_parent,o)
    on conflict(child_id) do update set revision=excluded.revision;
  return o;
end $$;

create function public.plan_start_terms(p_card uuid,p_generation integer) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('purpose',purpose,'monthly_cents',monthly_cents) from public.plan_starts where card_setup_id=p_card and generation=p_generation;
$$;
create or replace function public.plan_start_answer(p_row public.plan_starts,p_admitted boolean) returns jsonb
language sql immutable security definer set search_path='' as $$
 select jsonb_build_object('admitted',p_admitted,'generation',p_row.generation,'key',p_row.start_key,'card',p_row.payment_method_id,
 'at',p_row.started_at,'state',p_row.state,'subscription',p_row.subscription_id,'first_charge',p_row.first_charge_at,
 'finished_at',p_row.finished_at,'email',p_row.email_state,'alert',p_row.team_alert_state,'purpose',p_row.purpose,'monthly_cents',p_row.monthly_cents);
$$;
create function public.admit_plan_start_terms(p_card uuid,p_generation integer,p_key text,p_payment_method text,p_purpose text,p_monthly_cents integer,p_revision text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid; p uuid; last public.plan_starts; control public.child_plan_controls;
begin
  select child_id,parent_id into c,p from public.card_setups where id=p_card;
  if c is null then raise exception 'plan_start_no_card_setup'; end if;
  perform public.plan_control_owner(p,p_card);
  if exists(select 1 from public.plan_control_operations where child_id=c and state='open') then raise exception 'plan_control_pending' using errcode='55000'; end if;
  select * into control from public.child_plan_controls where child_id=c;
  select * into last from public.plan_starts where card_setup_id=p_card order by generation desc limit 1;
  if p_purpose not in ('initial','restart') or p_monthly_cents<0 or p_generation<1 then raise exception 'invalid_start_terms'; end if;
  if (last.generation is not null and last.generation>=p_generation) or last.state='open' then
    -- An old initial caller sends trial fields without inspecting purpose. Never disclose a Restart key to it.
    if last.purpose<>p_purpose then raise exception 'restart_required' using errcode='55000'; end if;
    return public.plan_start_answer(last,false);
  end if;
  if p_purpose='initial' and (control.cancelled or exists(select 1 from public.plan_starts where card_setup_id=p_card and state in ('started','other'))) then
    raise exception 'restart_required' using errcode='55000';
  end if;
  if p_purpose='restart' and coalesce(control.revision::text,'')<>p_revision then raise exception 'stale_restart' using errcode='55000'; end if;
  insert into public.child_card_updates(child_id,parent_id) values(c,p) on conflict(child_id) do nothing;
  perform 1 from public.child_card_updates where child_id=c for update;
  if coalesce(last.generation,0)<>p_generation-1 then raise exception 'plan_start_generation_gap'; end if;
  insert into public.plan_starts(card_setup_id,generation,parent_id,start_key,payment_method_id,purpose,monthly_cents)
    values(p_card,p_generation,p,p_key,p_payment_method,p_purpose,p_monthly_cents) returning * into last;
  return public.plan_start_answer(last,true);
end $$;
-- An older deployment cannot open a repeat initial start or race a new control.
create or replace function public.admit_plan_start(p_card uuid,p_generation integer,p_key text,p_payment_method text) returns jsonb
language sql security definer set search_path='' as $$
 select public.admit_plan_start_terms(p_card,p_generation,p_key,p_payment_method,'initial',null);
$$;

-- A paid Restart creates an actionable request in the same transaction as its matching start resolution.
create function public.record_paid_restart() returns trigger
language plpgsql security definer set search_path='' as $$
declare c uuid;
begin
  if new.purpose='restart' and new.state='started' and old.state='open'
    and exists(select 1 from public.parents where id=new.parent_id and deletion_requested_at is null) then
    select child_id into c from public.card_setups where id=new.card_setup_id;
    -- A paid start opens a new plan period, including when the old plan ended outside this application.
    update public.plan_control_operations set mailing_retired_at=clock_timestamp()
      where child_id=c and kind='pause' and mailing_retired_at is null;
    insert into public.workbook_restart_requests(card_setup_id,generation,parent_id,child_id)
      values(new.card_setup_id,new.generation,new.parent_id,c) on conflict do nothing;
    insert into public.child_plan_controls(child_id,parent_id,cancelled) values(c,new.parent_id,false)
      on conflict(child_id) do update set cancelled=false;
  end if;
  return new;
end $$;
create trigger record_paid_restart after update on public.plan_starts for each row execute function public.record_paid_restart();

-- One ordered obligation rule for parent reads, preparation and shipment. A later number cannot skip an
-- outstanding target. A shipment at or above that target satisfies it. Plan boundaries retire its mailing effect.
create function public.plan_mailing_obligations(p_child uuid,p_number integer)
returns table(target integer,weeks integer)
language sql stable security definer set search_path='' as $$
 select o.target_number,sum(o.weeks)::integer from public.plan_control_operations o
 where o.child_id=p_child and o.kind='pause' and o.state='applied' and o.mailing_retired_at is null
   and o.target_number<=p_number
   and not exists(select 1 from public.workbooks b where b.child_id=p_child and b.status='shipped' and b.number>=o.target_number)
 group by o.target_number order by o.target_number;
$$;
create function public.plan_mailing_weeks(p_parent uuid,p_child uuid,p_number integer) returns integer
language sql stable security definer set search_path='' as $$
 select coalesce(sum(o.weeks),0)::integer from public.plan_mailing_obligations(p_child,p_number) o
 where exists(select 1 from public.children where id=p_child and parent_id=p_parent);
$$;

-- Enforce every outstanding obligation at the write boundary. Late pauses leave the next book unchanged.
create function public.assert_plan_workbook_allowed(p_child uuid,p_number integer,p_shipping boolean) returns void
language plpgsql security definer set search_path='' as $$
declare p uuid; w record; obligation record; today date; shipped date;
begin
  select parent_id into p from public.children where id=p_child;
  if exists(select 1 from public.child_plan_controls where child_id=p_child and cancelled) then raise exception 'plan_cancelled' using errcode='55000'; end if;
  if exists(select 1 from public.plan_control_operations where child_id=p_child and state='open') then raise exception 'plan_control_pending' using errcode='55000'; end if;
  select period into today from public._maya_family_window(p,'day',clock_timestamp());
  for obligation in select * from public.plan_mailing_obligations(p_child,p_number) loop
    select number,shipped_at into w from public.workbooks where child_id=p_child and status='shipped' and number=obligation.target-1;
    if w.shipped_at is null then raise exception 'pause_previous_book_required' using errcode='55000'; end if;
    select period into shipped from public._maya_family_window(p,'day',w.shipped_at);
    if today<shipped+14+obligation.weeks*7 then raise exception 'plan_paused' using errcode='55000'; end if;
  end loop;
end $$;
create function public.fence_plan_workbook() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- Lock only admission and shipment. A heartbeat already holds a run lock; it must not take the child lock after it.
  if tg_table_name='workbooks' then
    if new.status='shipped' and (tg_op='INSERT' or old.status is distinct from new.status) then
      perform 1 from public.children where id=new.child_id for no key update;
      perform public.assert_plan_workbook_allowed(new.child_id,new.number,true);
    end if;
  elsif tg_op='INSERT' then
    perform 1 from public.children where id=new.child_id for no key update;
    perform public.assert_plan_workbook_allowed(new.child_id,new.number,false);
  end if;
  return new;
end $$;
create trigger fence_plan_workbook before insert or update on public.workbooks for each row execute function public.fence_plan_workbook();
create trigger fence_plan_workbook before insert on public.workbook_runs for each row execute function public.fence_plan_workbook();

-- Link the manual prepare action to the request. The existing job reads the current profile when it makes its plan.
create function public.fulfil_paid_restart_request() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.workbook_restart_requests set run_id=new.id where child_id=new.child_id and run_id is null;
  return new;
end $$;
create trigger fulfil_paid_restart_request after insert on public.workbook_runs for each row execute function public.fulfil_paid_restart_request();

-- All entry points are service only. Private helpers have no external execute grant.
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature,p.proname name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname=any(array['plan_control_owner','plan_control_context','plan_control_operation','admit_plan_pause','finish_plan_control','admit_plan_cancel','plan_start_terms','admit_plan_start_terms','record_paid_restart','plan_mailing_obligations','plan_mailing_weeks','assert_plan_workbook_allowed','fence_plan_workbook','fulfil_paid_restart_request']) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    if f.name=any(array['plan_control_context','plan_control_operation','admit_plan_pause','finish_plan_control','admit_plan_cancel','plan_start_terms','admit_plan_start_terms','plan_mailing_weeks']) then
      execute format('grant execute on function %s to service_role',f.signature);
    end if;
  end loop;
end $$;

alter table public.child_plan_states drop constraint child_plan_states_kind_check;
alter table public.child_plan_states add constraint child_plan_states_kind_check
 check(kind in ('not_started','free_month','paying','payment_failed','ending','ended','paused'));
