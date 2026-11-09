-- Keep a book in clock recovery until its current delivery calendar is recorded.
create or replace function public.list_workbook_scan_recovery_books(p_kind text,p_limit integer,p_after uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare answer jsonb;
begin
  if p_kind is null or p_kind not in ('unseeded','due','inactivity','reminder-due') or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'invalid_scan_recovery_batch'; end if;
  select coalesce(jsonb_agg(to_jsonb(batch) order by batch.workbook_id),'[]'::jsonb) into answer from (
    select w.id workbook_id,w.parent_id,w.child_id,w.number,e.audit delivery_audit_id
    from public.workbooks w join public.parents p on p.id=w.parent_id
    join public.workbook_delivery_receipts r on r.workbook_id=w.id and r.parent_id=w.parent_id and r.child_id=w.child_id and r.number=w.number
    cross join lateral (select coalesce((select max(c.audit_id) from public.workbook_delivery_corrections c where c.workbook_id=w.id),r.audit_id) audit) e
    where w.status='shipped' and w.printed_revision ~ '^[0-9a-f]{28}$' and p.deletion_requested_at is null
      and not exists(select 1 from public.child_deletions d where d.child_id=w.child_id)
      and (p_after is null or w.id>p_after) and public._workbook_scan_day7(w.id) is not null
      and case p_kind
        when 'unseeded' then not exists(select 1 from public.workbook_scan_delivery_calendars calendar where calendar.delivery_audit_id=e.audit)
        when 'due' then exists(select 1 from public.workbook_scan_delivery_calendars calendar where calendar.delivery_audit_id=e.audit and calendar.backstop_at<=clock_timestamp())
          and not exists(select 1 from public.workbook_scan_trigger_claims claim where claim.workbook_id=w.id)
          and not exists(select 1 from public.workbook_scan_backstop_holds hold where hold.workbook_id=w.id and hold.delivery_audit_id=e.audit)
        when 'inactivity' then public._workbook_scan_inactivity_recovery(w.id,p_kind,clock_timestamp())
        when 'reminder-due' then public._workbook_scan_inactivity_recovery(w.id,p_kind,clock_timestamp())
      end
    order by w.id limit p_limit
  ) batch;
  return answer;
end $$;
