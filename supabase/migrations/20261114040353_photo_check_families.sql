-- #856: the photo check runs for every family `scanChecksAccess` allows. Test families and admins keep the database's own
-- membership check (photo_check_eligible, read in the claim's and the finish's transaction after the parent row lock).
-- A family admitted by a running plan in families mode is admitted by the server's access decision: p_family is true only
-- then (src/lib/scan-photo-check-store.ts), and the server asks that decision again before the photo is sent and before
-- the finish. The privacy page names the photo check's provider (#854).
-- Additive: new overloads with p_family; the four-argument functions stay for the deployed code.

create or replace function public.claim_photo_check(p_parent uuid, p_id uuid, p_token uuid, p_stale_seconds int, p_family boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_stale_seconds is null or p_stale_seconds < 1 then raise exception 'bad_stale_seconds'; end if;
  if p_family is null then raise exception 'bad_family'; end if;
  perform 1 from public.parents where id = p_parent for share;
  if not found or not (p_family or public.photo_check_eligible(p_parent)) then return false; end if;
  update public.scan_photos set photo_check = jsonb_build_object('state', 'pending', 'token', p_token::text, 'at', now())
    where id = p_id and parent_id = p_parent and state = 'saved' and sent_at is null
      and (photo_check is null or (photo_check->>'state' = 'pending'
        and (photo_check->>'at')::timestamptz < now() - make_interval(secs => p_stale_seconds)));
  return found;
end $$;
revoke all on function public.claim_photo_check(uuid, uuid, uuid, int, boolean) from public, anon, authenticated;
grant execute on function public.claim_photo_check(uuid, uuid, uuid, int, boolean) to service_role;

create or replace function public.finish_photo_check(p_parent uuid, p_id uuid, p_token uuid, p_result jsonb, p_family boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_result is null or jsonb_typeof(p_result) <> 'object' or p_result->>'state' not in ('done', 'unknown') then
    raise exception 'bad_photo_check';
  end if;
  if p_family is null then raise exception 'bad_family'; end if;
  perform 1 from public.parents where id = p_parent for share;
  if not found then return false; end if;
  if not (p_family or public.photo_check_eligible(p_parent)) then
    update public.scan_photos set photo_check = null
      where id = p_id and parent_id = p_parent
        and photo_check->>'state' = 'pending' and photo_check->>'token' = p_token::text;
    return false;
  end if;
  update public.scan_photos set photo_check = p_result
    where id = p_id and parent_id = p_parent
      and photo_check->>'state' = 'pending' and photo_check->>'token' = p_token::text;
  return found;
end $$;
revoke all on function public.finish_photo_check(uuid, uuid, uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.finish_photo_check(uuid, uuid, uuid, jsonb, boolean) to service_role;
