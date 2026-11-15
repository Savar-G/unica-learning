-- Receipt admission still required calibration version 1 after the writer moved to 2.
-- Copied from pg_get_functiondef(public._admit_workbook_scan_receipt(uuid)) on
-- 2026-11-15; only the calibration-version predicate changes. Signature/ACLs stay intact.
-- Vitest's calibration tests have no PostgreSQL connection. The local PostgreSQL
-- probe in supabase/tests/workbook_scan_receipts.cjs imports CALIBRATION_VERSION
-- from TypeScript and exercises this rule, so changing the writer cannot drift silently.

CREATE OR REPLACE FUNCTION public._admit_workbook_scan_receipt(p_photo uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.scan_photos; c public.scan_calibrations; w public.workbooks; p public.workbook_pages; receipt uuid; at_time timestamptz;
begin
  -- The transition's RPC already owns photo then calibration. Keep that order for the common helper too.
  select * into s from public.scan_photos where id=p_photo for update;
  if not found then return null; end if;
  perform public.assert_family_writable(s.parent_id);
  select * into c from public.scan_calibrations where photo_id=s.id for share;
  if not found then return null; end if;
  w:=public._lock_workbook_scan_book(s.workbook_id);
  at_time:=clock_timestamp();
  if w.id is null or s.created_at<(select installed_at from public.workbook_scan_receipt_epoch)
    or s.state<>'saved' or s.terminal_at is not null or s.expires_at<=at_time or s.stored_bytes<=0 or s.width<=0 or s.height<=0
    or w.status<>'shipped' or w.parent_id<>s.parent_id or w.child_id<>s.child_id or w.number<1
    or w.printed_revision is distinct from s.printed_revision or s.printed_revision !~ '^[0-9a-f]{28}$'
    or c.state<>'ready' or c.parent_id<>s.parent_id or c.printed_revision<>s.printed_revision
    or not public.scan_marking_sheet_current(c.result)
    or c.result->'calibration'->>'revision' is distinct from s.printed_revision
    or (c.result->'calibration'->'version' is distinct from '1'::jsonb and c.result->'calibration'->'version' is distinct from '2'::jsonb)
    or jsonb_typeof(c.result->'parts') is distinct from 'array' then return null; end if;
  select * into p from public.workbook_pages where id=s.page_id and workbook_id=w.id and parent_id=s.parent_id;
  if not found or p.print_contract is null or p.print_contract->'version' is distinct from '1'::jsonb
    or p.print_contract->>'workbookId' is distinct from w.id::text or p.print_contract->'page' is distinct from to_jsonb(p.page_number)
    or p.page_type in ('cover','how-plan','back-cover','blank')
    or not exists(select 1 from public.workbook_questions where page_id=p.id and parent_id=s.parent_id)
    or public._workbook_scan_day7(w.id) is null then return null; end if;
  if not c.result->'parts' @> '["straight"]'::jsonb or jsonb_array_length(c.result->'parts')>201
    or exists(select 1 from jsonb_array_elements(c.result->'parts') x where jsonb_typeof(x)<>'string' or (x#>>'{}') !~ '^(straight|crop-[0-9]{1,3})$') then return null; end if;
  -- Metadata proves recorded durable bytes, not just a promised object name. All parts belong to this calibration lease.
  if not exists(select 1 from storage.objects where bucket_id='scan-photos' and name=s.parent_id::text||'/'||s.id::text||'/photo.jpg'
    and metadata->>'size' ~ '^[1-9][0-9]{0,8}$' and metadata->>'mimetype'='image/jpeg')
    or exists(select 1 from jsonb_array_elements_text(c.result->'parts') part where not exists(select 1 from storage.objects o
      where o.bucket_id='scan-photos' and o.name=s.parent_id::text||'/'||s.id::text||'/'||c.lease_token::text||'-'||part.value||'.jpg'
      and o.metadata->>'size' ~ '^[1-9][0-9]{0,8}$' and o.metadata->>'mimetype'='image/jpeg')) then return null; end if;
  select id into receipt from public.workbook_scan_receipts where photo_revision=s.id;
  if receipt is not null then return receipt; end if;
  insert into public.workbook_scan_receipts(parent_id,child_id,workbook_id,number,printed_revision,page_id,photo_revision,calibration_token,accepted_at)
    values(s.parent_id,s.child_id,w.id,w.number,w.printed_revision,p.id,s.id,c.lease_token,at_time) returning id into receipt;
  -- Only a later accepted photo of this exact canonical page can resolve previous pending work.
  if exists(select 1 from public.workbook_scan_receipts r where r.workbook_id=w.id and r.printed_revision=w.printed_revision
    and r.page_id=p.id and r.accepted_at<at_time and r.id<>receipt) then
    insert into public.workbook_scan_pending_items(receipt_id,item_row_id,parent_id,child_id,item_id,result_version,expected)
      select receipt,m.id,m.parent_id,m.child_id,m.item_id,m.result_version,m.expected from public.scan_marking_items m
      where m.parent_id=s.parent_id and m.child_id=s.child_id and m.workbook_id=w.id and m.printed_revision=w.printed_revision
        and m.page_id=p.id and m.observation->>'state' in ('pending','parent-pending');
  end if;
  perform public._claim_workbook_scan_trigger(w.id,null);
  return receipt;
end $function$;

-- Reuse the full admission path (family fence, print contract, durable bytes,
-- expiry and day-7 checks included). Already accepted photos are skipped; the
-- helper also locks the photo and returns its existing receipt on a concurrent retry.
do $backfill$
declare photo uuid;
begin
  for photo in
    select s.id
    from public.scan_photos s
    join public.scan_calibrations c on c.photo_id=s.id
    where s.state='saved' and c.state='ready'
      and c.result->'calibration'->'version'='2'::jsonb
      and not exists(select 1 from public.workbook_scan_receipts r where r.photo_revision=s.id)
    order by s.id
  loop
    perform public._admit_workbook_scan_receipt(photo);
  end loop;
end $backfill$;
