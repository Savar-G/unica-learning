-- The parent PIN (#300, spec #295, D-165): one 4-digit PIN per parent, which the child's desk asks for before it lets
-- the child leave. Checked on the server (src/lib/parent-pin.ts), never in the browser.
-- Only the server touches this table: the secret key (service_role skips row-level security) reads and writes it. The
-- table has row-level security on, no policy and no grant for anon or authenticated, so a signed-in parent cannot read
-- even their own row (the salted scrypt hash and the attempt count stay on the server), and cannot read another family's.
-- A family deletion removes the row with the parent (on delete cascade), and the family write fence covers new rows.
-- Additive: a new table and one new service-only function that the code on main does not use.
--
-- pin_hash: `scrypt$N$r$p$salt$hash` (base64), salted per row. failed_attempts / locked_until: the attempt limit.
create table public.parent_pins (
  parent_id uuid primary key references public.parents (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  pin_hash text not null check (length(pin_hash) between 20 and 300),
  failed_attempts smallint not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz
);

alter table public.parent_pins enable row level security;
revoke all on table public.parent_pins from anon, authenticated;

create trigger fence_family_write before insert or update on public.parent_pins
  for each row execute function public.fence_family_write();

-- Counts one attempt before the server checks the hash, under a row lock, so guesses sent together cannot all pass the
-- limit. The attempt that reaches p_max starts the lock (the caller still checks that attempt; a right PIN clears it).
-- A claim during a lock changes nothing, so a wrong PIN cannot extend it. A lock that has ended gives a fresh count.
-- out_status: 'none' (no PIN), 'locked' (refused until out_locked_until) or 'open' (check this attempt).
create function public.claim_pin_attempt(p_parent uuid, p_now timestamptz, p_max int, p_lock_seconds int)
returns table (out_status text, out_hash text, out_attempts_left int, out_locked_until timestamptz)
language plpgsql security definer set search_path = '' as $$
declare r public.parent_pins;
begin
  select * into r from public.parent_pins where parent_id = p_parent for update;
  if not found then
    return query select 'none'::text, null::text, null::int, null::timestamptz;
    return;
  end if;
  if r.locked_until is not null then
    if r.locked_until > p_now then
      return query select 'locked'::text, null::text, null::int, r.locked_until;
      return;
    end if;
    r.failed_attempts := 0;
    r.locked_until := null;
  end if;
  r.failed_attempts := r.failed_attempts + 1;
  if r.failed_attempts >= p_max then
    r.locked_until := p_now + make_interval(secs => p_lock_seconds);
  end if;
  update public.parent_pins
    set failed_attempts = r.failed_attempts, locked_until = r.locked_until, updated_at = now()
    where parent_id = p_parent;
  return query select 'open'::text, r.pin_hash, greatest(0, p_max - r.failed_attempts), r.locked_until;
end $$;
revoke all on function public.claim_pin_attempt(uuid, timestamptz, int, int) from public, anon, authenticated;
grant execute on function public.claim_pin_attempt(uuid, timestamptz, int, int) to service_role;
