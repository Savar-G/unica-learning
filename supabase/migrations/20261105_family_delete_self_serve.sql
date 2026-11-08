-- A parent deletes the whole family from Account (#556, spec #544, D-247). Additive: one table and three service-only
-- functions that the code on main does not use. It creates no request and deletes no family.

-- The password tries, one row per parent. A separate row from public.parent_pins, because a parent with no PIN has no row
-- there. It has no family write fence trigger on purpose: it holds a count and no family data, and a parent must still
-- be able to try again for a family whose deletion is already requested (a lost answer, or a family the retention job
-- froze). The row goes with the parent through the cascade.
create table public.family_delete_attempts (
  parent_id uuid primary key references public.parents(id) on delete cascade,
  failed_attempts smallint not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz
);
alter table public.family_delete_attempts enable row level security;
revoke all on public.family_delete_attempts from public, anon, authenticated, service_role;

-- Counts one try under a row lock before the server checks the password, as claim_pin_reset_attempt does. The try that
-- reaches p_max locks until p_now + p_lock_seconds, a claim during a lock changes nothing, and a lock that has ended gives
-- a fresh count. out_status: 'locked' (refused until out_locked_until) or 'open' (check this try).
create function public.claim_family_delete_attempt(p_parent uuid, p_now timestamptz, p_max int, p_lock_seconds int)
returns table (out_status text, out_attempts_left int, out_locked_until timestamptz)
language plpgsql security definer set search_path = '' as $$
declare r public.family_delete_attempts;
begin
  insert into public.family_delete_attempts(parent_id) values (p_parent) on conflict (parent_id) do nothing;
  select * into r from public.family_delete_attempts where parent_id = p_parent for update;
  if r.locked_until is not null then
    if r.locked_until > p_now then
      return query select 'locked'::text, null::int, r.locked_until;
      return;
    end if;
    r.failed_attempts := 0;
    r.locked_until := null;
  end if;
  r.failed_attempts := r.failed_attempts + 1;
  if r.failed_attempts >= p_max then
    r.locked_until := p_now + make_interval(secs => p_lock_seconds);
  end if;
  update public.family_delete_attempts
    set failed_attempts = r.failed_attempts, locked_until = r.locked_until
    where parent_id = p_parent;
  return query select 'open'::text, greatest(0, p_max - r.failed_attempts), r.locked_until;
end $$;

-- A right password sets the count back.
create function public.clear_family_delete_attempts(p_parent uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.family_delete_attempts where parent_id = p_parent;
$$;

-- The parent's own request. The server calls this only after it checked the parent's password and stopped every plan.
-- It has the same effects and refusals as request_family_deletion, the admin's request, without the admin's session and
-- email check. A family the retention job froze moves to reason 'request', so a late 'keep' from that job cannot reopen
-- it (decide_family_deletion refuses it). check_only answers 'ready' and writes nothing, so a refusal can come before any
-- plan stops; the real call decides again under the row lock.
create function public.request_parent_family_deletion(p uuid, check_only boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.admin_users where user_id = p) then return 'protected'; end if;
  perform 1 from public.parents where id = p for update;
  if not found then return 'missing'; end if;
  if exists(select 1 from public.family_card_operations where parent_id = p) then return 'busy'; end if;
  if check_only then return 'ready'; end if;
  update public.parents set deletion_requested_at = coalesce(deletion_requested_at, now()) where id = p;
  insert into public.family_deletions(parent_id, reason) values (p, 'request')
    on conflict (parent_id) do update set reason = 'request';
  return 'requested';
end $$;

revoke all on function public.claim_family_delete_attempt(uuid, timestamptz, int, int),
  public.clear_family_delete_attempts(uuid), public.request_parent_family_deletion(uuid, boolean) from public, anon, authenticated;
grant execute on function public.claim_family_delete_attempt(uuid, timestamptz, int, int),
  public.clear_family_delete_attempts(uuid), public.request_parent_family_deletion(uuid, boolean) to service_role;
