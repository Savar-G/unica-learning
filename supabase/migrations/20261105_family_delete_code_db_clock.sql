-- Two review fixes for the family delete's code (#603, D-255). Additive: one new service-only function and two functions
-- replaced with the same signature. The code on main calls none of them. It removes nothing and changes no row.
-- public.spend_family_delete_code(uuid, text, timestamptz) stays and has no caller after this; a later cleanup can remove it.

-- 1. The database decides when a code has ended, by its own clock when it decides. A time from the app can be old: a slow read
-- between the app's clock and the spend used to pass a code that had ended. now() would not do: it is the time the transaction
-- started, so a wait for the row lock would not count. clock_timestamp() is read after the lock is held. Of two requests with
-- the same right code, the second waits for the lock, then finds the hash gone.
create function public.consume_family_delete_code(p_parent uuid, p_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  stored_hash text;
  stored_end timestamptz;
begin
  select code_hash, expires_at into stored_hash, stored_end
    from public.family_delete_codes where parent_id = p_parent for update;
  if stored_hash = p_hash and stored_end > clock_timestamp() then
    update public.family_delete_codes set code_hash = null, expires_at = null where parent_id = p_parent;
    return true;
  end if;
  return false;
end $$;

revoke all on function public.consume_family_delete_code(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_family_delete_code(uuid, text) to service_role;

-- The stored code, for the server to compare, only while it is live by the database's clock. The app needs no clock of its own
-- to answer "ended". Volatile, as clock_timestamp() is.
create or replace function public.read_family_delete_code(p_parent uuid)
returns table (out_hash text, out_expires_at timestamptz)
language sql volatile security definer set search_path = '' as $$
  select code_hash, expires_at from public.family_delete_codes where parent_id = p_parent and expires_at > clock_timestamp();
$$;

-- 2. When both send limits are full, out_retry_at is the later of their two times, the first time a send can go. The hour's time
-- alone sent a parent back to a request that the day's limit still refused. greatest() ignores a limit that is not full.
create or replace function public.begin_family_delete_code(p_parent uuid, p_hash text, p_now timestamptz, p_ttl_seconds int,
  p_per_window int, p_window_seconds int, p_per_day int, p_day_seconds int)
returns table (out_status text, out_retry_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  sends timestamptz[];
  day_sends timestamptz[];
  window_sends timestamptz[];
  lock_end timestamptz;
  retry_at timestamptz;
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
  retry_at := greatest(
    case when cardinality(window_sends) >= p_per_window then window_sends[1] + make_interval(secs => p_window_seconds) end,
    case when cardinality(day_sends) >= p_per_day then day_sends[1] + make_interval(secs => p_day_seconds) end);
  if retry_at is not null then
    return query select 'too_many'::text, retry_at;
    return;
  end if;
  update public.family_delete_codes
    set code_hash = p_hash, expires_at = p_now + make_interval(secs => p_ttl_seconds), send_times = day_sends || p_now
    where parent_id = p_parent;
  return query select 'ok'::text, null::timestamptz;
end $$;
