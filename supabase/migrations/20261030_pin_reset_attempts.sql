-- Forgot PIN (#301, review R349-1): the desk's PIN reset needs the parent's account password, which the server checks.
-- Those password tries have their own limit per parent, kept here beside the PIN's own: claim_pin_reset_attempt counts
-- one try under a row lock before the server checks the password, the try that reaches p_max locks resets until
-- p_now + p_lock_seconds, a claim during a lock changes nothing, and a lock that has ended gives a fresh count. A right
-- password resets the PIN, and that write sets the count back to 0 (src/lib/parent-pin-store.ts, reset).
-- Additive: two columns with defaults and one new service-only function that the code on main does not use.
alter table public.parent_pins
  add column reset_failed_attempts smallint not null default 0 check (reset_failed_attempts >= 0),
  add column reset_locked_until timestamptz;

-- out_status: 'none' (no PIN, so nothing to reset), 'locked' (refused until out_locked_until) or 'open' (check this try).
create function public.claim_pin_reset_attempt(p_parent uuid, p_now timestamptz, p_max int, p_lock_seconds int)
returns table (out_status text, out_attempts_left int, out_locked_until timestamptz)
language plpgsql security definer set search_path = '' as $$
declare r public.parent_pins;
begin
  select * into r from public.parent_pins where parent_id = p_parent for update;
  if not found then
    return query select 'none'::text, null::int, null::timestamptz;
    return;
  end if;
  if r.reset_locked_until is not null then
    if r.reset_locked_until > p_now then
      return query select 'locked'::text, null::int, r.reset_locked_until;
      return;
    end if;
    r.reset_failed_attempts := 0;
    r.reset_locked_until := null;
  end if;
  r.reset_failed_attempts := r.reset_failed_attempts + 1;
  if r.reset_failed_attempts >= p_max then
    r.reset_locked_until := p_now + make_interval(secs => p_lock_seconds);
  end if;
  update public.parent_pins
    set reset_failed_attempts = r.reset_failed_attempts, reset_locked_until = r.reset_locked_until
    where parent_id = p_parent;
  return query select 'open'::text, greatest(0, p_max - r.reset_failed_attempts), r.reset_locked_until;
end $$;
revoke all on function public.claim_pin_reset_attempt(uuid, timestamptz, int, int) from public, anon, authenticated;
grant execute on function public.claim_pin_reset_attempt(uuid, timestamptz, int, int) to service_role;
