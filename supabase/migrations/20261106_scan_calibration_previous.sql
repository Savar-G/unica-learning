-- Preserve the previous-lease cleanup contract while sharing the S4 processing slot.
create or replace function public.begin_scan_calibration(p_parent uuid, p_id uuid, p_token uuid, p_lease_seconds int default 90) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.scan_photos; c public.scan_calibrations; b record; l public.scan_limits;
begin
  perform public.assert_family_writable(p_parent);
  perform pg_advisory_xact_lock(hashtextextended('scan:'||p_parent::text,0));
  select * into r from public.scan_photos where id=p_id and parent_id=p_parent for update;
  if not found then return jsonb_build_object('status','unknown'); end if;
  if r.expires_at<=clock_timestamp() or not public.scan_photo_is_active(r.state,r.created_at,r.expires_at) then return jsonb_build_object('status','terminal'); end if;
  select w.printed_revision,p.print_contract is not null as has_contract into b
    from public.workbook_pages p join public.workbooks w on w.id=p.workbook_id where p.id=r.page_id and p.parent_id=p_parent;
  if not found or b.printed_revision is null or not b.has_contract then return jsonb_build_object('status','unavailable','reason','no-contract'); end if;
  if r.printed_revision is distinct from b.printed_revision then return jsonb_build_object('status','unavailable','reason','other-revision'); end if;
  select * into c from public.scan_calibrations where photo_id=p_id for update;
  if found then
    if c.state<>'running' then return jsonb_build_object('status',c.state); end if;
    if c.lease_until>clock_timestamp() then return jsonb_build_object('status','busy'); end if;
    if c.attempts>=5 then
      update public.scan_calibrations set state='refused',result=jsonb_build_object('reason','failed'),finished_at=clock_timestamp() where photo_id=p_id;
      return jsonb_build_object('status','refused');
    end if;
  end if;
  select * into l from public.scan_limits where singleton;
  if public.scan_active_jobs(p_parent)>=l.active_jobs then return jsonb_build_object('status','busy'); end if;
  if c.photo_id is null then
    insert into public.scan_calibrations(photo_id,parent_id,printed_revision,state,lease_token,lease_until)
      values(p_id,p_parent,r.printed_revision,'running',p_token,clock_timestamp()+make_interval(secs=>p_lease_seconds));
  else
    update public.scan_calibrations set lease_token=p_token,lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),attempts=attempts+1 where photo_id=p_id;
  end if;
  return jsonb_build_object('status','started','previous',c.lease_token);
end $$;
