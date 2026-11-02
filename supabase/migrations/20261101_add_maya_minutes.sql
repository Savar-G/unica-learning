-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_maya_minutes, 2026-11-01 (Supabase MCP, registry
-- 20261102012550).
-- Maya's minutes ledger (#330, spec #297): the family's time zone and one grant row per counted call. The ledger
-- module (src/lib/maya-minutes.ts) grants a call its seconds before the call starts: 10 minutes, or the minutes left
-- this week when fewer (30 minutes a week from Monday 00:00 in the family's time zone); a parent's "Try Maya" call
-- (#336) is granted from a separate daily cap per parent. When the call ends, a trigger on maya_calls settles the grant
-- at the call's connected seconds, at most the grant.
--
-- parents.time_zone: an IANA time zone name, written once from the parent's browser on Parent home
--   (/api/account/time-zone). Null: the ledger uses the child's province, else America/Vancouver.
-- maya_minute_grants: call_id is the call's id (the grant comes first, so no foreign key to maya_calls). period: the
--   local Monday of the week (kind 'child') or the local day (kind 'parent_demo'). used_seconds: null while the call is
--   open (it counts the whole grant then); set when the call ends. A grant with no call row two minutes after it was
--   made counts nothing (the start failed).
--
-- Writes: the server only, with the secret key, through grant_maya_minutes (one transaction, a lock per child or per
-- parent for a demo, so two starts at once never spend the same seconds; the same call id gets its grant again) and
-- the settle trigger. Reads: a parent reads their own rows and their own usage (maya_minutes_used checks the caller);
-- admins read all. A family deletion removes the rows through the foreign keys (on delete cascade from the parent and
-- the child); there are no files. The family write fence covers new rows and changes.
-- Additive: one new nullable column, one new table, three new functions and one new trigger on maya_calls.
alter table public.parents add column time_zone text
  check (time_zone is null or (char_length(time_zone) between 1 and 64 and time_zone ~ '^[A-Za-z][A-Za-z0-9_+/-]*$'));

create table public.maya_minute_grants (
  call_id uuid primary key,
  created_at timestamptz not null default now(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid,
  kind text not null check (kind in ('child', 'parent_demo')),
  period date not null,
  granted_seconds integer not null check (granted_seconds between 1 and 600),
  used_seconds integer check (used_seconds between 0 and granted_seconds),
  settled_at timestamptz,
  constraint maya_minute_grants_child_fkey foreign key (child_id, parent_id)
    references public.children (id, parent_id) on delete cascade,
  check ((kind = 'child') = (child_id is not null)),
  check ((used_seconds is null) = (settled_at is null))
);
create index maya_minute_grants_period_idx on public.maya_minute_grants (parent_id, kind, period);
create index maya_minute_grants_child_idx on public.maya_minute_grants (child_id, parent_id) where child_id is not null;

alter table public.maya_minute_grants enable row level security;
revoke all on table public.maya_minute_grants from anon, authenticated, service_role;
grant select, insert, update on table public.maya_minute_grants to service_role;
grant select on table public.maya_minute_grants to authenticated;
create policy "Parents read their own Maya minutes" on public.maya_minute_grants
  for select to authenticated using (parent_id = (select auth.uid()));
create policy "Admins read Maya minutes" on public.maya_minute_grants
  for select to authenticated using ((select public.is_admin()));

create trigger fence_family_write before insert or update on public.maya_minute_grants
  for each row execute function public.fence_family_write();

-- The seconds a period has used, without one call (p_except). Internal: no grant to any role.
create function public._maya_minutes_used(p_parent uuid, p_child uuid, p_kind text, p_period date, p_except uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case
    when g.used_seconds is not null then g.used_seconds
    when g.created_at > now() - interval '2 minutes' or exists (select 1 from public.maya_calls c where c.id = g.call_id) then g.granted_seconds
    else 0 end), 0)::integer
  from public.maya_minute_grants g
  where g.parent_id = p_parent and g.kind = p_kind and g.child_id is not distinct from p_child and g.period = p_period
    and g.call_id is distinct from p_except
$$;
revoke all on function public._maya_minutes_used(uuid, uuid, text, date, uuid) from public, anon, authenticated, service_role;

-- A period's used seconds: for the server, or for the parent of the family (another caller is refused).
create function public.maya_minutes_used(p_parent uuid, p_child uuid, p_kind text, p_period date)
returns integer language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.role()) is distinct from 'service_role' and p_parent is distinct from (select auth.uid()) then
    raise exception 'maya_minutes_denied' using errcode = '42501';
  end if;
  return public._maya_minutes_used(p_parent, p_child, p_kind, p_period, null);
end $$;
revoke all on function public.maya_minutes_used(uuid, uuid, text, date) from public, anon;
grant execute on function public.maya_minutes_used(uuid, uuid, text, date) to authenticated, service_role;

-- Grants a call min(call seconds, period seconds - used) seconds, or 0 (storing nothing) under the minimum.
create function public.grant_maya_minutes(p_call uuid, p_parent uuid, p_child uuid, p_kind text, p_period date,
  p_period_seconds integer, p_call_seconds integer, p_min_seconds integer)
returns table (granted integer, used_before integer) language plpgsql security definer set search_path = '' as $$
declare g public.maya_minute_grants; v_used integer; v_seconds integer;
begin
  if p_call is null or p_parent is null or p_period is null or p_kind is null or p_kind not in ('child', 'parent_demo')
    or (p_kind = 'child') <> (p_child is not null)
    or coalesce(p_period_seconds, 0) not between 1 and 86400 or coalesce(p_call_seconds, 0) not between 1 and 600
    or coalesce(p_min_seconds, 0) not between 1 and 600 then
    raise exception 'maya_minute_grant_invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('maya_minutes:' || p_kind || ':' || coalesce(p_child, p_parent)::text, 0));
  select * into g from public.maya_minute_grants where call_id = p_call;
  if found then
    if (g.parent_id, g.child_id, g.kind, g.period) is distinct from (p_parent, p_child, p_kind, p_period) then
      raise exception 'maya_minute_grant_mismatch' using errcode = '55000';
    end if;
    return query select g.granted_seconds, public._maya_minutes_used(p_parent, p_child, p_kind, p_period, p_call);
    return;
  end if;
  v_used := public._maya_minutes_used(p_parent, p_child, p_kind, p_period, null);
  v_seconds := least(p_call_seconds, greatest(0, p_period_seconds - v_used));
  if v_seconds < p_min_seconds then
    return query select 0, v_used;
    return;
  end if;
  insert into public.maya_minute_grants (call_id, parent_id, child_id, kind, period, granted_seconds)
    values (p_call, p_parent, p_child, p_kind, p_period, v_seconds);
  return query select v_seconds, v_used;
end $$;
revoke all on function public.grant_maya_minutes(uuid, uuid, uuid, text, date, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.grant_maya_minutes(uuid, uuid, uuid, text, date, integer, integer, integer) to service_role;

-- When a call ends, its grant counts the call's connected seconds (a text call's call seconds), at most the grant.
create function public.settle_maya_minutes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  if new.status = 'ended' then
    v := greatest(0, coalesce(new.connected_seconds, new.call_seconds, 0));
    update public.maya_minute_grants g
      set used_seconds = least(g.granted_seconds, v), settled_at = coalesce(g.settled_at, now())
      where g.call_id = new.id and g.parent_id = new.parent_id and g.used_seconds is distinct from least(g.granted_seconds, v);
  end if;
  return null;
end $$;
revoke all on function public.settle_maya_minutes() from public, anon, authenticated;
create trigger settle_maya_minutes after insert or update of status, connected_seconds, call_seconds on public.maya_calls
  for each row execute function public.settle_maya_minutes();
