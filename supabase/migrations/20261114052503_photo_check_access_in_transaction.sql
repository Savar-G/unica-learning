-- #856 review (Savar, PR #953): the photo check's claim and finish decide access inside their own transaction.
-- p_access is the server's explicit decision, never widened by the database:
--   'closed'   refuse, whatever the family's test or admin membership (an explicit denial is never a fall-through);
--   'test'     the database's own membership check (photo_check_eligible), after the parent row lock, as before;
--   'families' the photo's child must have a running plan in public.child_plan_states, read here with a share lock on
--              the plan row, so a plan change made between the server's read and this write either commits first (and
--              is seen, so the write refuses) or waits for this transaction. The rule is plan-access.ts planAccessRule:
--              free_month with a first charge, paying, or ending before its end; anything else, or no row, is closed.
-- The p_family boolean overloads of 20261114040353 trusted p_family = true. They were added by the same unmerged PR and
-- no deployed code calls them, so they are dropped. The four-argument functions the live site calls are unchanged.

drop function if exists public.claim_photo_check(uuid, uuid, uuid, int, boolean);
drop function if exists public.finish_photo_check(uuid, uuid, uuid, jsonb, boolean);

create or replace function public.photo_check_plan_open(p_parent uuid, p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_kind text; v_next timestamptz; v_ends timestamptz;
begin
  select s.kind, s.next_charge_at, s.ends_at into v_kind, v_next, v_ends
    from public.scan_photos p
    join public.child_plan_states s on s.child_id = p.child_id and s.parent_id = p.parent_id
    where p.id = p_id and p.parent_id = p_parent
    for share of s;
  if not found then return false; end if;
  return v_kind = 'paying'
    or (v_kind = 'free_month' and v_next is not null)
    or (v_kind = 'ending' and v_ends is not null and now() < v_ends);
end $$;
revoke all on function public.photo_check_plan_open(uuid, uuid) from public, anon, authenticated, service_role;

create or replace function public.photo_check_access_open(p_parent uuid, p_id uuid, p_access text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_access = 'test' then return public.photo_check_eligible(p_parent); end if;
  if p_access = 'families' then return public.photo_check_plan_open(p_parent, p_id); end if;
  return false;
end $$;
revoke all on function public.photo_check_access_open(uuid, uuid, text) from public, anon, authenticated, service_role;

create or replace function public.claim_photo_check(p_parent uuid, p_id uuid, p_token uuid, p_stale_seconds int, p_access text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_stale_seconds is null or p_stale_seconds < 1 then raise exception 'bad_stale_seconds'; end if;
  if p_access is null or p_access not in ('closed', 'test', 'families') then raise exception 'bad_access'; end if;
  perform 1 from public.parents where id = p_parent for share;
  if not found or not public.photo_check_access_open(p_parent, p_id, p_access) then return false; end if;
  update public.scan_photos set photo_check = jsonb_build_object('state', 'pending', 'token', p_token::text, 'at', now())
    where id = p_id and parent_id = p_parent and state = 'saved' and sent_at is null
      and (photo_check is null or (photo_check->>'state' = 'pending'
        and (photo_check->>'at')::timestamptz < now() - make_interval(secs => p_stale_seconds)));
  return found;
end $$;
revoke all on function public.claim_photo_check(uuid, uuid, uuid, int, text) from public, anon, authenticated;
grant execute on function public.claim_photo_check(uuid, uuid, uuid, int, text) to service_role;

create or replace function public.finish_photo_check(p_parent uuid, p_id uuid, p_token uuid, p_result jsonb, p_access text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_result is null or jsonb_typeof(p_result) <> 'object' or p_result->>'state' not in ('done', 'unknown') then
    raise exception 'bad_photo_check';
  end if;
  if p_access is null or p_access not in ('closed', 'test', 'families') then raise exception 'bad_access'; end if;
  perform 1 from public.parents where id = p_parent for share;
  if not found then return false; end if;
  if not public.photo_check_access_open(p_parent, p_id, p_access) then
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
revoke all on function public.finish_photo_check(uuid, uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.finish_photo_check(uuid, uuid, uuid, jsonb, text) to service_role;
