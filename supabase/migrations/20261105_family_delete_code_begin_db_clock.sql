-- A review fix for the family delete's code (#603, D-255): the app's clock no longer sets a code's end or the send limits. An app
-- clock 5 minutes ahead gave a code about 15 minutes. Additive: one new service-only function and two revokes. It changes no row.
--
-- Later cleanup, when a person can confirm the drop: public.begin_family_delete_code(uuid, text, timestamptz, int, int, int, int, int)
-- and public.spend_family_delete_code(uuid, text, timestamptz). Both take a caller's time, and after this no role but the owner can
-- call them. The code on main has never called either one, so no deploy needs them. Only old previews of this pull request do.

-- Under the row lock: refused during the tries' lock and past either send limit (out_retry_at says when), else the send counts and
-- this hash replaces the code before it. out_status: 'ok', 'too_many' or 'locked'. The time is the database's, read once after the
-- row lock is held: now() is the transaction's start, so a wait for the lock would not count. When both send limits are full,
-- out_retry_at is the later of their two times.
create function public.begin_family_delete_code(p_parent uuid, p_hash text, p_ttl_seconds int,
  p_per_window int, p_window_seconds int, p_per_day int, p_day_seconds int)
returns table (out_status text, out_retry_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  sends timestamptz[];
  day_sends timestamptz[];
  window_sends timestamptz[];
  lock_end timestamptz;
  retry_at timestamptz;
  sent_at timestamptz;
begin
  insert into public.family_delete_codes(parent_id) values (p_parent) on conflict (parent_id) do nothing;
  select send_times into sends from public.family_delete_codes where parent_id = p_parent for update;
  sent_at := clock_timestamp();
  select locked_until into lock_end from public.family_delete_attempts where parent_id = p_parent;
  if lock_end is not null and lock_end > sent_at then
    return query select 'locked'::text, lock_end;
    return;
  end if;
  day_sends := coalesce((select array_agg(t order by t) from unnest(sends) t where t > sent_at - make_interval(secs => p_day_seconds)), '{}');
  window_sends := coalesce((select array_agg(t order by t) from unnest(day_sends) t where t > sent_at - make_interval(secs => p_window_seconds)), '{}');
  retry_at := greatest(
    case when cardinality(window_sends) >= p_per_window then window_sends[1] + make_interval(secs => p_window_seconds) end,
    case when cardinality(day_sends) >= p_per_day then day_sends[1] + make_interval(secs => p_day_seconds) end);
  if retry_at is not null then
    return query select 'too_many'::text, retry_at;
    return;
  end if;
  update public.family_delete_codes
    set code_hash = p_hash, expires_at = sent_at + make_interval(secs => p_ttl_seconds), send_times = day_sends || sent_at
    where parent_id = p_parent;
  return query select 'ok'::text, null::timestamptz;
end $$;

revoke all on function public.begin_family_delete_code(uuid, text, int, int, int, int, int) from public, anon, authenticated;
grant execute on function public.begin_family_delete_code(uuid, text, int, int, int, int, int) to service_role;

-- No caller remains for the two functions that take a time, so no caller can pass one.
revoke execute on function public.begin_family_delete_code(uuid, text, timestamptz, int, int, int, int, int) from service_role;
revoke execute on function public.spend_family_delete_code(uuid, text, timestamptz) from service_role;
