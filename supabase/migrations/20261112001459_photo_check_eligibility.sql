-- #855 review: the photo check runs only while the family is a test family or an admin. The claim and the finish check
-- that membership in their own transaction. Each first takes the parent row FOR SHARE: admin_set_test_account takes it
-- FOR UPDATE before it removes a family from test_accounts, so a claim or finish waits for that change and then reads
-- the membership as committed. Parent before photo: the order of family deletion and the write fence.
-- Additive: same signatures and grants; the live code keeps working before and after.

create or replace function public.photo_check_eligible(p_parent uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.test_accounts where parent_id = p_parent)
      or exists(select 1 from public.admin_users where user_id = p_parent);
$$;
revoke all on function public.photo_check_eligible(uuid) from public, anon, authenticated;
grant execute on function public.photo_check_eligible(uuid) to service_role;

-- Claims a photo's check for one token: only for a test family or an admin, a saved photo that is not sent, with no check
-- yet or only a pending one older than p_stale_seconds. True: the pending value is written.
create or replace function public.claim_photo_check(p_parent uuid, p_id uuid, p_token uuid, p_stale_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_stale_seconds is null or p_stale_seconds < 1 then raise exception 'bad_stale_seconds'; end if;
  perform 1 from public.parents where id = p_parent for share;
  if not found or not public.photo_check_eligible(p_parent) then return false; end if;
  update public.scan_photos set photo_check = jsonb_build_object('state', 'pending', 'token', p_token::text, 'at', now())
    where id = p_id and parent_id = p_parent and state = 'saved' and sent_at is null
      and (photo_check is null or (photo_check->>'state' = 'pending'
        and (photo_check->>'at')::timestamptz < now() - make_interval(secs => p_stale_seconds)));
  return found;
end $$;

-- Stores a check's result while this token's claim is the pending one and the family is still a test family or an admin.
-- A family that is no longer eligible gets no result: its pending claim is removed (null), and the answer is false.
-- A result of a replaced claim changes nothing. A late result (the photo was sent meanwhile) is stored.
create or replace function public.finish_photo_check(p_parent uuid, p_id uuid, p_token uuid, p_result jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_result is null or jsonb_typeof(p_result) <> 'object' or p_result->>'state' not in ('done', 'unknown') then
    raise exception 'bad_photo_check';
  end if;
  perform 1 from public.parents where id = p_parent for share;
  if not found then return false; end if;
  if not public.photo_check_eligible(p_parent) then
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
