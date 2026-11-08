-- Applied through the Management API to cdjobwsyzndtltzfpyqa, registry 20261102052532.
-- R425M-1. One claim stores every included call ID, including calls without notes and omitted transcripts.
-- No weekly claims existed at the pre-migration probe. Old signatures and columns remain available.
alter table public.email_log add column call_ids uuid[];

-- Serialize all weekly claims for a parent, including different week keys during a zone change.
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
  if exists (select 1 from public.email_log where parent_id = p_parent and kind = 'maya_weekly'
    and status in ('claimed', 'sent') and call_ids && p_calls) then return null; end if;
  if exists (select 1 from unnest(p_calls) id where not exists (
    select 1 from public.maya_calls c where c.id = id and c.parent_id = p_parent and c.status = 'ended' and c.kind = 'family'
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
revoke all on function public.claim_maya_weekly(uuid, date, uuid[], text, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_maya_weekly(uuid, date, uuid[], text, uuid, integer) to service_role;
