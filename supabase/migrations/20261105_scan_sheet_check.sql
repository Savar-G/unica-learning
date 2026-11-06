-- The sheet check (#456, S3a): a page is ready only when the photo is all this page. Additive: the live code keeps working.
--
-- A ready result records the sheet check it passed in result->>'sheetCheck'. A ready result made before that check (no
-- version, or an older one) is not ready: Send leaves it, and the crop job takes it back under its own lease and checks it
-- again. Version 1 is the first sheet check; raise the number here and in SHEET_CHECK_VERSION (src/lib/scan-crops.ts)
-- together.

-- Takes an older ready result back under p_token, as begin_scan_calibration takes over a lapsed lease: the row is running
-- again with no result, and the answer names the lease it replaced, so the job removes that lease's files. Any other row
-- answers as begin_scan_calibration does. The photo's stored bytes keep the old files' count until they are removed, as
-- bytes awaiting cleanup still count.
create function public.reopen_scan_calibration(p_parent uuid, p_id uuid, p_token uuid, p_sheet_check int, p_lease_seconds int default 90) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.scan_photos; c public.scan_calibrations;
begin
  perform public.assert_family_writable(p_parent);
  select * into r from public.scan_photos where id = p_id and parent_id = p_parent for update;
  if not found then return jsonb_build_object('status', 'unknown'); end if;
  if not public.scan_photo_is_active(r.state, r.created_at, r.expires_at) then return jsonb_build_object('status', 'terminal'); end if;
  select * into c from public.scan_calibrations where photo_id = p_id for update;
  if not found or c.state <> 'ready' or coalesce(case when jsonb_typeof(c.result->'sheetCheck') = 'number' then (c.result->>'sheetCheck')::numeric end, 0) >= p_sheet_check then
    return public.begin_scan_calibration(p_parent, p_id, p_token, p_lease_seconds);
  end if;
  update public.scan_calibrations set state = 'running', result = null, finished_at = null, lease_token = p_token,
    lease_until = now() + make_interval(secs => p_lease_seconds), attempts = 1 where photo_id = p_id;
  return jsonb_build_object('status', 'started', 'previous', c.lease_token);
end $$;
revoke all on function public.reopen_scan_calibration(uuid, uuid, uuid, int, int) from public, anon, authenticated;
grant execute on function public.reopen_scan_calibration(uuid, uuid, uuid, int, int) to service_role;

-- Send records only pages whose ready result passed the sheet check (version 1 or later). Same signature and answer.
create or replace function public.send_scan_photos(p_parent uuid, p_child uuid, p_ids uuid[]) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare sent uuid[];
begin
  perform public.assert_family_writable(p_parent);
  if p_ids is null or cardinality(p_ids) = 0 then return '{}'; end if;
  if cardinality(p_ids) > 200 then raise exception 'too_many_pages'; end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:' || p_parent::text, 0));
  perform 1 from public.scan_photos where parent_id = p_parent and id = any(p_ids) order by id for update;
  update public.scan_photos s set sent_at = now()
    from public.scan_calibrations c
    where s.parent_id = p_parent and s.child_id = p_child and s.id = any(p_ids) and s.sent_at is null and s.state = 'saved'
      and public.scan_photo_is_active(s.state, s.created_at, s.expires_at)
      and c.photo_id = s.id and c.parent_id = s.parent_id and c.state = 'ready' and c.printed_revision = s.printed_revision
      and jsonb_typeof(c.result->'sheetCheck') = 'number' and (c.result->>'sheetCheck')::numeric >= 1;
  select coalesce(array_agg(id order by id), '{}') into sent from public.scan_photos
    where parent_id = p_parent and child_id = p_child and id = any(p_ids) and sent_at is not null and state = 'saved';
  return sent;
end $$;
