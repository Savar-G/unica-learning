-- Applied through the Management API to cdjobwsyzndtltzfpyqa, registry 20261102052529.
-- R425M-2. Count grant instants in the current family-local time window, across zone source changes.
-- Keep the old signatures for deployed callers. New grants retain their start instant for the call-insert guard.
-- The child/parent advisory lock and full expired-grant re-reservation remain mandatory.
alter table public.maya_minute_grants add column period_start timestamptz;
create index maya_minute_grants_window_idx on public.maya_minute_grants(parent_id, kind, created_at);

create or replace function public._maya_minutes_used(p_parent uuid, p_child uuid, p_kind text, p_period_start timestamptz, p_except uuid)
returns integer language sql volatile security definer set search_path = '' as $$
  select coalesce(sum(case
    when g.used_seconds is not null then g.used_seconds
    when g.created_at > clock_timestamp() - interval '2 minutes'
      or exists (select 1 from public.maya_calls c where c.id = g.call_id) then g.granted_seconds
    else 0 end), 0)::integer
  from public.maya_minute_grants g
  where g.parent_id = p_parent and g.kind = p_kind and g.child_id is not distinct from p_child and g.created_at >= p_period_start
    and g.call_id is distinct from p_except
$$;

create or replace function public.grant_maya_minutes(p_call uuid, p_parent uuid, p_child uuid, p_kind text, p_period date,
  p_period_seconds integer, p_call_seconds integer, p_min_seconds integer, p_period_start timestamptz)
returns table (granted integer, used_before integer) language plpgsql security definer set search_path = '' as $$
declare g public.maya_minute_grants; v_used integer; v_seconds integer; v_existing boolean;
begin
  if p_call is null or p_parent is null or p_period is null or p_period_start is null or not isfinite(p_period_start) or p_period_start > clock_timestamp() or p_kind is null or p_kind not in ('child', 'parent_demo')
    or (p_kind = 'child') <> (p_child is not null)
    or coalesce(p_period_seconds, 0) not between 1 and 86400 or coalesce(p_call_seconds, 0) not between 1 and 600
    or coalesce(p_min_seconds, 0) not between 1 and 600 then
    raise exception 'maya_minute_grant_invalid' using errcode = '22023';
  end if;
  -- Enforce the product limits even when a caller supplies an older or larger cap.
  p_period_seconds := least(p_period_seconds, case when p_kind = 'child' then 1800 else 120 end);
  p_call_seconds := least(p_call_seconds, case when p_kind = 'child' then 600 else 120 end);
  perform pg_advisory_xact_lock(hashtextextended('maya_minutes:' || p_kind || ':' || coalesce(p_child, p_parent)::text, 0));
  select * into g from public.maya_minute_grants where call_id = p_call;
  v_existing := found;
  if v_existing then
    if (g.parent_id, g.child_id, g.kind) is distinct from (p_parent, p_child, p_kind) then
      raise exception 'maya_minute_grant_mismatch' using errcode = '55000';
    end if;
    if g.used_seconds is not null or exists (select 1 from public.maya_calls c where c.id = p_call)
      or (g.created_at > clock_timestamp() - interval '2 minutes' and g.granted_seconds <= p_call_seconds) then
      return query select g.granted_seconds, public._maya_minutes_used(p_parent, p_child, p_kind, p_period_start, p_call);
      return;
    end if;
  end if;
  v_used := public._maya_minutes_used(p_parent, p_child, p_kind, p_period_start, p_call);
  v_seconds := least(p_call_seconds, greatest(0, p_period_seconds - v_used));
  if v_seconds < greatest(p_min_seconds, coalesce(g.granted_seconds, 0)) then
    return query select 0, v_used;
    return;
  end if;
  if v_existing then
    update public.maya_minute_grants set created_at = clock_timestamp(), period_start = p_period_start, period = p_period where call_id = p_call;
    v_seconds := g.granted_seconds;
  else
    insert into public.maya_minute_grants (call_id, created_at, parent_id, child_id, kind, period, granted_seconds, period_start)
      values (p_call, clock_timestamp(), p_parent, p_child, p_kind, p_period, v_seconds, p_period_start);
  end if;
  return query select v_seconds, v_used;
end $$;

create or replace function public.maya_minutes_used(p_parent uuid, p_child uuid, p_kind text, p_period_start timestamptz)
returns integer language plpgsql volatile security definer set search_path = '' as $$
begin
  if (select auth.role()) is distinct from 'service_role' and p_parent is distinct from (select auth.uid()) then
    raise exception 'maya_minutes_denied' using errcode = '42501';
  end if;
  if p_period_start is null or not isfinite(p_period_start) then
    raise exception 'maya_minute_period_invalid' using errcode = '22023';
  end if;
  return public._maya_minutes_used(p_parent, p_child, p_kind, p_period_start, null);
end $$;
revoke all on function public._maya_minutes_used(uuid, uuid, text, timestamptz, uuid) from public, anon, authenticated, service_role;
revoke all on function public.maya_minutes_used(uuid, uuid, text, timestamptz) from public, anon;
grant execute on function public.maya_minutes_used(uuid, uuid, text, timestamptz) to authenticated, service_role;
revoke all on function public.grant_maya_minutes(uuid, uuid, uuid, text, date, integer, integer, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.grant_maya_minutes(uuid, uuid, uuid, text, date, integer, integer, integer, timestamptz) to service_role;

create or replace function public.reserve_maya_minutes_on_call() returns trigger
language plpgsql security definer set search_path = '' as $$
declare g public.maya_minute_grants; v_seconds integer;
begin
  select * into g from public.maya_minute_grants where call_id = new.id;
  -- Existing admin test calls have no grant and remain uncounted.
  if not found then return new; end if;
  if g.parent_id is distinct from new.parent_id or (g.kind = 'child' and g.child_id is distinct from new.child_id)
    or g.used_seconds is not null then
    raise exception 'maya_minute_grant_mismatch' using errcode = '55000';
  end if;
  if g.period_start is null then
  select granted into v_seconds from public.grant_maya_minutes(g.call_id, g.parent_id, g.child_id, g.kind, g.period,
    case when g.kind = 'child' then 1800 else 120 end, g.granted_seconds, g.granted_seconds);
  else
  select granted into v_seconds from public.grant_maya_minutes(g.call_id, g.parent_id, g.child_id, g.kind, g.period,
    case when g.kind = 'child' then 1800 else 120 end, g.granted_seconds, g.granted_seconds, g.period_start);
  end if;
  if v_seconds <> g.granted_seconds then
    raise exception 'maya_minute_grant_expired' using errcode = '55000';
  end if;
  return new;
end $$;
revoke all on function public.reserve_maya_minutes_on_call() from public, anon, authenticated, service_role;
