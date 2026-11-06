-- PR637 adds a calibration reopen path. S4 makes it share admission with every processing stage.
-- Parent, scan-family lock, photo, calibration. Preserve the old lease token for scoped file cleanup.
-- Do not replace the separately owned send_scan_photos function.
create or replace function public.reopen_scan_calibration(p_parent uuid,p_id uuid,p_token uuid,p_sheet_check int,p_lease_seconds int default 90) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.scan_photos; c public.scan_calibrations; l public.scan_limits;
begin
  perform public.assert_family_writable(p_parent);
  perform pg_advisory_xact_lock(hashtextextended('scan:'||p_parent::text,0));
  select * into r from public.scan_photos where id=p_id and parent_id=p_parent for update;
  if not found then return jsonb_build_object('status','unknown'); end if;
  if r.expires_at<=clock_timestamp() or not public.scan_photo_is_active(r.state,r.created_at,r.expires_at) then return jsonb_build_object('status','terminal'); end if;
  select * into c from public.scan_calibrations where photo_id=p_id for update;
  if not found or c.state<>'ready' or coalesce(case when jsonb_typeof(c.result->'sheetCheck')='number' then (c.result->>'sheetCheck')::numeric end,0)>=p_sheet_check then
    return public.begin_scan_calibration(p_parent,p_id,p_token,p_lease_seconds);
  end if;
  select * into l from public.scan_limits where singleton;
  if public.scan_active_jobs(p_parent)>=l.active_jobs then return jsonb_build_object('status','busy'); end if;
  update public.scan_calibrations set state='running',result=null,finished_at=null,lease_token=p_token,
    lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),attempts=1 where photo_id=p_id;
  return jsonb_build_object('status','started','previous',c.lease_token);
end $$;
revoke all on function public.reopen_scan_calibration(uuid,uuid,uuid,int,int) from public,anon,authenticated;
grant execute on function public.reopen_scan_calibration(uuid,uuid,uuid,int,int) to service_role;
