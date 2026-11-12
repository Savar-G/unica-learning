-- The photo check at upload (#855, spec #850 slice C). Additive: the live code keeps working before and after.
--
-- scan_photos.photo_check: null (not eligible, never started), {"state":"pending","token","at"}, {"state":"done", the
-- probabilities, the problem, the model, the threshold version, the time}, or {"state":"unknown", the error kind, ...}.
-- The server writes it only through the two functions below. Parents read their own row's value through the existing
-- policy (scan_family_read), admins every row (scan_admin_read).
alter table public.scan_photos add column photo_check jsonb
  constraint scan_photo_check_shape check (
    photo_check is null or (
      jsonb_typeof(photo_check) = 'object'
      and photo_check->>'state' in ('pending', 'done', 'unknown')
      and pg_column_size(photo_check) <= 4096
    )
  );
grant select (photo_check) on public.scan_photos to authenticated;

-- Claims a photo's check for one token: only a saved photo that is not sent, with no check yet or only a pending one older
-- than p_stale_seconds (a claim whose function stopped). True: the pending value is written. The family write fence
-- (trigger fence_family_write) refuses a family being deleted.
create function public.claim_photo_check(p_parent uuid, p_id uuid, p_token uuid, p_stale_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_stale_seconds is null or p_stale_seconds < 1 then raise exception 'bad_stale_seconds'; end if;
  update public.scan_photos set photo_check = jsonb_build_object('state', 'pending', 'token', p_token::text, 'at', now())
    where id = p_id and parent_id = p_parent and state = 'saved' and sent_at is null
      and (photo_check is null or (photo_check->>'state' = 'pending'
        and (photo_check->>'at')::timestamptz < now() - make_interval(secs => p_stale_seconds)));
  return found;
end $$;
revoke all on function public.claim_photo_check(uuid, uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.claim_photo_check(uuid, uuid, uuid, int) to service_role;

-- Stores a check's result while this token's claim is the pending one. A late result (the photo was sent meanwhile) is
-- stored; a result of a replaced claim changes nothing. False: nothing written.
create function public.finish_photo_check(p_parent uuid, p_id uuid, p_token uuid, p_result jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_result is null or jsonb_typeof(p_result) <> 'object' or p_result->>'state' not in ('done', 'unknown') then
    raise exception 'bad_photo_check';
  end if;
  update public.scan_photos set photo_check = p_result
    where id = p_id and parent_id = p_parent
      and photo_check->>'state' = 'pending' and photo_check->>'token' = p_token::text;
  return found;
end $$;
revoke all on function public.finish_photo_check(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.finish_photo_check(uuid, uuid, uuid, jsonb) to service_role;
