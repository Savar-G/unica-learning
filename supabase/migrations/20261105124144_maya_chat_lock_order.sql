-- #590, from the review of PR #584 (#530). Three races in 20261105081527_maya_chat_rehearsal_guard.sql:
-- 1. Removing a family's test mark took the family lock, then updated its chat list row. An admin's change to the chat
--    list row holds that row before its trigger takes the family lock. Two sessions deadlocked (40P01).
-- 2. The weekly recap claim took the family lock, then its email_log write locked the parent row (fence_family_write).
--    A family's deletion holds the parent row first, and its cascade takes the family lock. Deadlock (40P01).
-- 3. Moving a test mark to another parent (update test_accounts set parent_id) skipped the cleanup: the first family
--    kept its rehearsal with no test mark.
--
-- One lock order for a family, everywhere: the parent row (for share), then its chat list row (for no key update), then
-- the family lock ('maya_weekly:' || parent). lock_maya_family takes all three in that order. A delete of a test mark
-- or a chat list row already holds its own row, and taking the parent row after it could wait on a deletion that
-- waits on that row, so a delete takes only the chat list row and the family lock (lock_maya_family_list).
-- A test mark keeps its parent: changing it is refused, like a chat list row's parent.
--
-- Additive: the same functions and triggers with new bodies, and one new function. No table changes.

create function public.lock_maya_family_list(p uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.maya_chat_families where parent_id = p for no key update;
  perform pg_advisory_xact_lock(hashtextextended('maya_weekly:' || p::text, 0));
end $$;
revoke all on function public.lock_maya_family_list(uuid) from public, anon, authenticated;

create or replace function public.lock_maya_family(p uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.parents where id = p for share;
  perform public.lock_maya_family_list(p);
end $$;
revoke all on function public.lock_maya_family(uuid) from public, anon, authenticated;

-- Insert and update: fence_family_write (it fires first, by name) already holds the parent row, and an update holds the
-- chat list row. A delete holds the chat list row.
create or replace function public.maya_chat_family_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform public.lock_maya_family_list(old.parent_id);
    return old;
  end if;
  if tg_op = 'UPDATE' and new.parent_id is distinct from old.parent_id then
    raise exception 'maya_chat_family_parent_fixed' using errcode = '55000';
  end if;
  perform public.lock_maya_family(new.parent_id);
  if new.rehearsal and not exists (select 1 from public.test_accounts t where t.parent_id = new.parent_id) then
    raise exception 'maya_chat_rehearsal_not_test_family' using errcode = '55000';
  end if;
  return new;
end $$;

-- A test mark's removal locks the chat list row before the family lock, so test_account_ends_rehearsal updates a row
-- this session already holds.
create or replace function public.test_account_family_lock() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.parent_id is distinct from old.parent_id then
    raise exception 'test_account_parent_fixed' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then
    perform public.lock_maya_family_list(old.parent_id);
    return old;
  end if;
  perform public.lock_maya_family(new.parent_id);
  return new;
end $$;

-- Same claim as 20261105081527_maya_chat_rehearsal_guard.sql, with the locks of lock_maya_family. A family that is gone
-- or being deleted is not claimed.
create or replace function public.claim_maya_weekly(p_parent uuid, p_week date, p_calls uuid[], p_hash text,
  p_retry uuid, p_attempts integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_parent is null or p_week is null or extract(isodow from p_week) <> 1
    or coalesce(cardinality(p_calls), 0) = 0 or array_position(p_calls, null) is not null
    or p_hash is null or p_attempts is null then
    raise exception 'maya_weekly_claim_invalid' using errcode = '22023';
  end if;
  perform public.lock_maya_family(p_parent);
  if not exists (select 1 from public.parents p where p.id = p_parent and p.deletion_requested_at is null) then
    return null;
  end if;
  -- A test family gets no recap unless it is the rehearsal family (#530).
  if exists (select 1 from public.test_accounts t where t.parent_id = p_parent)
    and not exists (select 1 from public.maya_chat_families r where r.parent_id = p_parent and r.rehearsal) then
    return null;
  end if;
  if exists (select 1 from public.email_log where parent_id = p_parent and kind = 'maya_weekly'
    and status in ('claimed', 'sent') and call_ids && p_calls) then return null; end if;
  if exists (select 1 from unnest(p_calls) id where not exists (
    select 1 from public.maya_calls c where c.id = id and c.parent_id = p_parent and c.status = 'ended' and c.kind in ('family','chat')
  )) then raise exception 'maya_weekly_calls_invalid' using errcode = '22023'; end if;
  if p_retry is not null then
    update public.email_log set status = 'claimed', attempts = p_attempts + 1, unsubscribe_hash = p_hash,
      error = null, call_ids = p_calls
    where id = p_retry and parent_id = p_parent and kind = 'maya_weekly' and week_start = p_week
      and status = 'failed' and attempts = p_attempts and attempts < 3
    returning id into v_id;
  else
    insert into public.email_log(parent_id, kind, week_start, status, attempts, unsubscribe_hash, call_ids)
      values(p_parent, 'maya_weekly', p_week, 'claimed', 1, p_hash, p_calls)
      on conflict do nothing returning id into v_id;
  end if;
  return v_id;
end $$;
