-- The one-time code that confirms a family delete (#603, D-255). Additive: one table and three service-only functions that the
-- code on main does not use. It creates no request. Wrong tries stay in public.family_delete_attempts, with their existing
-- functions. public.request_parent_family_deletion(uuid, boolean) still has no caller; a later cleanup can remove it.

-- One row per parent: the hash of the one live code and the times of the recent sends. Only the server's secret key reaches
-- it, and only through the functions below. No family write fence trigger, as on family_delete_attempts: it holds no family
-- data, and a parent must still be able to confirm for a family the retention job froze. The row goes with the parent.
create table public.family_delete_codes (
  parent_id uuid primary key references public.parents(id) on delete cascade,
  code_hash text,
  expires_at timestamptz,
  send_times timestamptz[] not null default '{}',
  constraint family_delete_code_whole check ((code_hash is null) = (expires_at is null))
);
alter table public.family_delete_codes enable row level security;
revoke all on public.family_delete_codes from public, anon, authenticated, service_role;

-- Under the row lock: refused during the tries' lock and past either send limit (out_retry_at says when), else the send counts
-- and this hash replaces the code before it. out_status: 'ok', 'too_many' or 'locked'.
create function public.begin_family_delete_code(p_parent uuid, p_hash text, p_now timestamptz, p_ttl_seconds int,
  p_per_window int, p_window_seconds int, p_per_day int, p_day_seconds int)
returns table (out_status text, out_retry_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  sends timestamptz[];
  day_sends timestamptz[];
  window_sends timestamptz[];
  lock_end timestamptz;
begin
  insert into public.family_delete_codes(parent_id) values (p_parent) on conflict (parent_id) do nothing;
  select send_times into sends from public.family_delete_codes where parent_id = p_parent for update;
  select locked_until into lock_end from public.family_delete_attempts where parent_id = p_parent;
  if lock_end is not null and lock_end > p_now then
    return query select 'locked'::text, lock_end;
    return;
  end if;
  day_sends := coalesce((select array_agg(t order by t) from unnest(sends) t where t > p_now - make_interval(secs => p_day_seconds)), '{}');
  window_sends := coalesce((select array_agg(t order by t) from unnest(day_sends) t where t > p_now - make_interval(secs => p_window_seconds)), '{}');
  if cardinality(window_sends) >= p_per_window then
    return query select 'too_many'::text, window_sends[1] + make_interval(secs => p_window_seconds);
    return;
  end if;
  if cardinality(day_sends) >= p_per_day then
    return query select 'too_many'::text, day_sends[1] + make_interval(secs => p_day_seconds);
    return;
  end if;
  update public.family_delete_codes
    set code_hash = p_hash, expires_at = p_now + make_interval(secs => p_ttl_seconds), send_times = day_sends || p_now
    where parent_id = p_parent;
  return query select 'ok'::text, null::timestamptz;
end $$;

-- The stored code, for the server to compare. No row when none was ever sent.
create function public.read_family_delete_code(p_parent uuid)
returns table (out_hash text, out_expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select code_hash, expires_at from public.family_delete_codes where parent_id = p_parent;
$$;

-- Ends the code when it is still this hash and still live. The update takes the row lock, so of two requests with the same
-- right code only one gets true.
create function public.spend_family_delete_code(p_parent uuid, p_hash text, p_now timestamptz) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.family_delete_codes set code_hash = null, expires_at = null
    where parent_id = p_parent and code_hash = p_hash and expires_at > p_now;
  return found;
end $$;

revoke all on function public.begin_family_delete_code(uuid, text, timestamptz, int, int, int, int, int),
  public.read_family_delete_code(uuid), public.spend_family_delete_code(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.begin_family_delete_code(uuid, text, timestamptz, int, int, int, int, int),
  public.read_family_delete_code(uuid), public.spend_family_delete_code(uuid, text, timestamptz) to service_role;
