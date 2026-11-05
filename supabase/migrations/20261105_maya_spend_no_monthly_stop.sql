-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration maya_spend_no_monthly_stop, 2026-11-05 (Supabase MCP).
-- Review of PR #640 (D-290, D-291): Savar decided a cap of CAD 10 per child a week and no shared stop.
--
-- reserve_maya_spend no longer refuses at a monthly total. It answers the month's counted micros, so the code can send
--   the team's one alert; the total has no effect on access. It takes one lock per child, as nothing is shared between
--   children any more. A global charge (admin test calls, practice runs, safety reads) takes no lock and has no cap.
-- _maya_spend_counted stops counting a reservation left unsettled for 10 minutes (RESERVATION_TTL_MS in
--   src/lib/maya-spend.ts), so a request cut off by a crash cannot lock a child out. A request settled with an unknown
--   cost stays counted at its reservation, and a late settle still writes its cost.
-- maya_spend.what also takes 'profile': the child profile's AI findings after a call.
--
-- Only the code of PR #640 calls these functions, and it is not merged, so the old signature is dropped here.
alter table public.maya_spend drop constraint maya_spend_what_check;
alter table public.maya_spend add constraint maya_spend_what_check check (what in ('model', 'review', 'note', 'profile', 'speech_to_text', 'voice'));

create or replace function public._maya_spend_counted(p_child uuid, p_week date, p_month date)
returns table (week_micros bigint, month_micros bigint) language sql stable security definer set search_path = '' as $$
  with counted as (
    select s.charge, s.child_id, s.week, s.month,
      coalesce(s.cost_micros, case when s.settled_at is not null or s.created_at >= now() - interval '10 minutes' then s.reserved_micros else 0 end) as micros
    from public.maya_spend s
    where s.month = p_month or (p_child is not null and s.child_id = p_child and s.week = p_week)
  )
  select
    coalesce(sum(c.micros) filter (where c.charge = 'child' and c.child_id = p_child and c.week = p_week), 0)::bigint,
    coalesce(sum(c.micros) filter (where c.month = p_month), 0)::bigint
  from counted c
$$;
revoke all on function public._maya_spend_counted(uuid, date, date) from public, anon, authenticated, service_role;

drop function public.reserve_maya_spend(uuid, text, uuid, uuid, uuid, text, date, bigint, date, bigint, bigint, boolean);

-- Reserves p_micros before a paid request when it fits a child's week. p_force counts it past the cap (the voice of words
-- already said). Answers ok, 'week' when it does not fit, and the month's counted micros with this request in them.
create function public.reserve_maya_spend(p_id uuid, p_charge text, p_parent uuid, p_child uuid, p_call uuid, p_what text,
  p_week date, p_week_cap bigint, p_month date, p_micros bigint, p_force boolean)
returns table (ok boolean, over text, month_micros bigint) language plpgsql security definer set search_path = '' as $$
declare r public.maya_spend; u record;
begin
  if p_id is null or p_charge is null or p_charge not in ('child', 'global') or p_what is null or p_month is null
    or p_micros is null or p_micros not between 0 and 100000000
    or (p_charge = 'child' and (p_child is null or p_parent is null or p_week is null or coalesce(p_week_cap, -1) < 0))
    or (p_child is not null and p_parent is null) then
    raise exception 'maya_spend_invalid' using errcode = '22023';
  end if;
  if p_charge = 'child' then
    perform pg_advisory_xact_lock(hashtextextended('maya_spend:' || p_child::text, 0));
  end if;
  select * into r from public.maya_spend where id = p_id;
  select * into u from public._maya_spend_counted(case when p_charge = 'child' then p_child end, p_week, p_month);
  if found and r.id is not null then
    if (r.charge, r.parent_id, r.child_id, r.what) is distinct from (p_charge, p_parent, p_child, p_what) then
      raise exception 'maya_spend_mismatch' using errcode = '55000';
    end if;
    return query select true, null::text, u.month_micros;
    return;
  end if;
  if not coalesce(p_force, false) and p_charge = 'child' and u.week_micros + p_micros > p_week_cap then
    return query select false, 'week'::text, u.month_micros;
    return;
  end if;
  insert into public.maya_spend (id, charge, parent_id, child_id, call_id, what, week, month, reserved_micros)
    values (p_id, p_charge, p_parent, p_child, p_call, p_what, case when p_charge = 'child' then p_week end, p_month, p_micros);
  return query select true, null::text, u.month_micros + p_micros;
end $$;
revoke all on function public.reserve_maya_spend(uuid, text, uuid, uuid, uuid, text, date, bigint, date, bigint, boolean) from public, anon, authenticated;
grant execute on function public.reserve_maya_spend(uuid, text, uuid, uuid, uuid, text, date, bigint, date, bigint, boolean) to service_role;
