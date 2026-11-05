-- Review of PR #584 (#530). Two guards for the rehearsal family, in the database:
-- 1. A rehearsal row needs the family's test mark (public.test_accounts), on insert and update, whoever writes it. Removing
--    a family's test mark ends its rehearsal in the same transaction (the family is then a real family, which gets notes
--    and recaps anyway). A family's deletion is not refused.
-- 2. The weekly recap claim (claim_maya_weekly) refuses a test family that is not the rehearsal family, so an admin who
--    stops the rehearsal before delivery stops the email. Real families are claimed exactly as before.
-- Every change to a family's test mark or chat list row takes the same per-family lock as the weekly claim
-- ('maya_weekly:' || parent), so a claim and a change never interleave, and two admins' changes to one family run one
-- after the other.
-- Additive: new trigger functions and triggers, and claim_maya_weekly replaced with one more check.

create function public.lock_maya_family(p uuid) returns void
language sql security definer set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended('maya_weekly:' || p::text, 0));
$$;
revoke all on function public.lock_maya_family(uuid) from public, anon, authenticated;

-- A rehearsal row only for a test family. Runs after the family lock, so it sees a test mark removal that committed
-- while it waited.
create function public.maya_chat_family_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform public.lock_maya_family(old.parent_id);
    return old;
  end if;
  perform public.lock_maya_family(new.parent_id);
  if tg_op = 'UPDATE' and new.parent_id is distinct from old.parent_id then
    raise exception 'maya_chat_family_parent_fixed' using errcode = '55000';
  end if;
  if new.rehearsal and not exists (select 1 from public.test_accounts t where t.parent_id = new.parent_id) then
    raise exception 'maya_chat_rehearsal_not_test_family' using errcode = '55000';
  end if;
  return new;
end $$;
revoke all on function public.maya_chat_family_guard() from public, anon, authenticated;
create trigger maya_chat_family_guard before insert or update or delete on public.maya_chat_families
  for each row execute function public.maya_chat_family_guard();

-- A test mark change takes the family lock first; removing the mark ends the rehearsal. During a family deletion the
-- parent row is already gone and its chat list row goes with it, so nothing is changed.
create function public.test_account_family_lock() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_maya_family(coalesce(new.parent_id, old.parent_id));
  return coalesce(new, old);
end $$;
revoke all on function public.test_account_family_lock() from public, anon, authenticated;
create trigger test_account_family_lock before insert or update or delete on public.test_accounts
  for each row execute function public.test_account_family_lock();

create function public.test_account_ends_rehearsal() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.parents p where p.id = old.parent_id) then
    update public.maya_chat_families set rehearsal = false where parent_id = old.parent_id and rehearsal;
  end if;
  return old;
end $$;
revoke all on function public.test_account_ends_rehearsal() from public, anon, authenticated;
create trigger test_account_ends_rehearsal after delete on public.test_accounts
  for each row execute function public.test_account_ends_rehearsal();

-- Same claim as 20261102173557_desk_maya_chat_recap.sql, with the family check after the lock.
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
  perform pg_advisory_xact_lock(hashtextextended('maya_weekly:' || p_parent::text, 0));
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
