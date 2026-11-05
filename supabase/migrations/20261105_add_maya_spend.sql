-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_maya_spend, 2026-11-05 (Supabase MCP).
-- Maya's spending cap (D-290, D-291, src/lib/maya-spend.ts): one row per paid provider request of Maya (her model, the
-- free-talk review, the call note's AI, a voice call's speech-to-text and voice), in whole micro-units of CAD.
--
-- maya_spend: id is the reservation's id. charge 'child' counts toward the child's week (week: the child's local Monday)
--   and the monthly total; 'global' (admin test calls, the local practice tools) toward the monthly total only. month:
--   the first day of the calendar month in Pacific time. reserved_micros: what was reserved before the request.
--   cost_micros: the actual cost once settled. A row counts cost_micros when it is set, else reserved_micros: an open
--   request, and one whose cost is not known (uncertain), stay counted at their reservation.
-- maya_spend_alerts: one row per month the monthly total was reached: the team's alert email goes once.
--
-- Writes: the server only, with the secret key, through reserve_maya_spend (one transaction under one lock for all of
-- Maya, so two reservations at once never both take the last room of a week or the month; the same id again changes
-- nothing), settle_maya_spend (the first settle stays) and claim_maya_spend_alert. Reads: maya_spend_used for the server;
-- admins read the rows; parents read nothing (Parent home reads through the server). A family deletion removes the
-- family's rows through the foreign keys; the family write fence covers new rows and changes.
-- Additive: two new tables and four new functions.
create table public.maya_spend (
  id uuid primary key,
  created_at timestamptz not null default now(),
  charge text not null check (charge in ('child', 'global')),
  parent_id uuid references public.parents (id) on delete cascade,
  child_id uuid,
  call_id uuid,
  what text not null check (what in ('model', 'review', 'note', 'speech_to_text', 'voice')),
  week date check (week is null or extract(isodow from week) = 1),
  month date not null check (extract(day from month) = 1),
  reserved_micros bigint not null check (reserved_micros between 0 and 100000000),
  cost_micros bigint check (cost_micros between 0 and 100000000),
  uncertain boolean not null default false,
  settled_at timestamptz,
  constraint maya_spend_child_fkey foreign key (child_id, parent_id)
    references public.children (id, parent_id) on delete cascade,
  check (charge <> 'child' or (child_id is not null and week is not null)),
  check (charge = 'child' or week is null),
  check ((settled_at is null) = (cost_micros is null and not uncertain)),
  check (not (uncertain and cost_micros is not null))
);
create index maya_spend_month_idx on public.maya_spend (month);
create index maya_spend_week_idx on public.maya_spend (child_id, week) where charge = 'child';
create index maya_spend_parent_idx on public.maya_spend (parent_id) where parent_id is not null;

alter table public.maya_spend enable row level security;
revoke all on table public.maya_spend from anon, authenticated, service_role;
grant select on table public.maya_spend to service_role, authenticated;
create policy "Admins read Maya spending" on public.maya_spend
  for select to authenticated using ((select public.is_admin()));

create trigger fence_family_write before insert or update on public.maya_spend
  for each row execute function public.fence_family_write();

create table public.maya_spend_alerts (
  month date primary key check (extract(day from month) = 1),
  claimed_at timestamptz not null default now()
);
alter table public.maya_spend_alerts enable row level security;
revoke all on table public.maya_spend_alerts from anon, authenticated, service_role;
grant select on table public.maya_spend_alerts to service_role, authenticated;
create policy "Admins read Maya spending alerts" on public.maya_spend_alerts
  for select to authenticated using ((select public.is_admin()));

-- The counted micros of a child's week (0 without a child) and of a month. Internal: no grant to any role.
create function public._maya_spend_counted(p_child uuid, p_week date, p_month date)
returns table (week_micros bigint, month_micros bigint) language sql stable security definer set search_path = '' as $$
  select
    coalesce(sum(coalesce(s.cost_micros, s.reserved_micros)) filter (where s.charge = 'child' and s.child_id = p_child and s.week = p_week), 0)::bigint,
    coalesce(sum(coalesce(s.cost_micros, s.reserved_micros)) filter (where s.month = p_month), 0)::bigint
  from public.maya_spend s
  where s.month = p_month or (p_child is not null and s.child_id = p_child and s.week = p_week)
$$;
revoke all on function public._maya_spend_counted(uuid, date, date) from public, anon, authenticated, service_role;

-- Reserves p_micros before a paid request when it fits: the month first, then a child's week. p_force counts it past a
-- cap (the voice of words already chosen). Answers ok, or which cap it does not fit.
create function public.reserve_maya_spend(p_id uuid, p_charge text, p_parent uuid, p_child uuid, p_call uuid, p_what text,
  p_week date, p_week_cap bigint, p_month date, p_month_cap bigint, p_micros bigint, p_force boolean)
returns table (ok boolean, over text) language plpgsql security definer set search_path = '' as $$
declare r public.maya_spend; u record;
begin
  if p_id is null or p_charge is null or p_charge not in ('child', 'global') or p_what is null or p_month is null
    or p_micros is null or p_micros not between 0 and 100000000 or coalesce(p_month_cap, -1) < 0
    or (p_charge = 'child' and (p_child is null or p_parent is null or p_week is null or coalesce(p_week_cap, -1) < 0))
    or (p_child is not null and p_parent is null) then
    raise exception 'maya_spend_invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('maya_spend', 0));
  select * into r from public.maya_spend where id = p_id;
  if found then
    if (r.charge, r.parent_id, r.child_id, r.what) is distinct from (p_charge, p_parent, p_child, p_what) then
      raise exception 'maya_spend_mismatch' using errcode = '55000';
    end if;
    return query select true, null::text;
    return;
  end if;
  select * into u from public._maya_spend_counted(case when p_charge = 'child' then p_child end, p_week, p_month);
  if not coalesce(p_force, false) then
    if u.month_micros + p_micros > p_month_cap then
      return query select false, 'month'::text;
      return;
    end if;
    if p_charge = 'child' and u.week_micros + p_micros > p_week_cap then
      return query select false, 'week'::text;
      return;
    end if;
  end if;
  insert into public.maya_spend (id, charge, parent_id, child_id, call_id, what, week, month, reserved_micros)
    values (p_id, p_charge, p_parent, p_child, p_call, p_what, case when p_charge = 'child' then p_week end, p_month, p_micros);
  return query select true, null::text;
end $$;
revoke all on function public.reserve_maya_spend(uuid, text, uuid, uuid, uuid, text, date, bigint, date, bigint, bigint, boolean) from public, anon, authenticated;
grant execute on function public.reserve_maya_spend(uuid, text, uuid, uuid, uuid, text, date, bigint, date, bigint, bigint, boolean) to service_role;

-- Settles a reservation with its actual cost; null keeps it counted at its reservation (the cost is not known). The first
-- settle stays. True when this call settled it.
create function public.settle_maya_spend(p_id uuid, p_cost bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_id is null or (p_cost is not null and p_cost not between 0 and 100000000) then
    raise exception 'maya_spend_invalid' using errcode = '22023';
  end if;
  update public.maya_spend set cost_micros = p_cost, uncertain = (p_cost is null), settled_at = now()
    where id = p_id and settled_at is null;
  return found;
end $$;
revoke all on function public.settle_maya_spend(uuid, bigint) from public, anon, authenticated;
grant execute on function public.settle_maya_spend(uuid, bigint) to service_role;

-- The counted micros of a child's week and of a month, for the server.
create function public.maya_spend_used(p_child uuid, p_week date, p_month date)
returns table (week_micros bigint, month_micros bigint) language sql stable security definer set search_path = '' as $$
  select * from public._maya_spend_counted(p_child, p_week, p_month)
$$;
revoke all on function public.maya_spend_used(uuid, date, date) from public, anon, authenticated;
grant execute on function public.maya_spend_used(uuid, date, date) to service_role;

-- True the first time a month's total is reached: the team's alert goes once.
create function public.claim_maya_spend_alert(p_month date)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  insert into public.maya_spend_alerts (month) values (p_month) on conflict (month) do nothing;
  return found;
end $$;
revoke all on function public.claim_maya_spend_alert(date) from public, anon, authenticated;
grant execute on function public.claim_maya_spend_alert(date) to service_role;
