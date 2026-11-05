-- A takeover names the lease it replaced, so the new job removes that lease's files only. Without it, a stalled job that
-- woke up could remove the files of the job that took over.
create or replace function public.begin_scan_calibration(p_parent uuid, p_id uuid, p_token uuid, p_lease_seconds int default 90) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.scan_photos; c public.scan_calibrations; b record;
begin
  perform public.assert_family_writable(p_parent);
  select * into r from public.scan_photos where id = p_id and parent_id = p_parent for update;
  if not found then return jsonb_build_object('status', 'unknown'); end if;
  if not public.scan_photo_is_active(r.state, r.created_at, r.expires_at) then return jsonb_build_object('status', 'terminal'); end if;
  select w.printed_revision, p.print_contract is not null as has_contract into b
    from public.workbook_pages p join public.workbooks w on w.id = p.workbook_id
    where p.id = r.page_id and p.parent_id = p_parent;
  if not found or b.printed_revision is null or not b.has_contract then return jsonb_build_object('status', 'unavailable', 'reason', 'no-contract'); end if;
  if r.printed_revision is distinct from b.printed_revision then return jsonb_build_object('status', 'unavailable', 'reason', 'other-revision'); end if;
  select * into c from public.scan_calibrations where photo_id = p_id for update;
  if not found then
    insert into public.scan_calibrations(photo_id, parent_id, printed_revision, state, lease_token, lease_until)
      values (p_id, p_parent, r.printed_revision, 'running', p_token, now() + make_interval(secs => p_lease_seconds));
    return jsonb_build_object('status', 'started', 'previous', null);
  end if;
  if c.state <> 'running' then return jsonb_build_object('status', c.state); end if;
  if c.lease_until > now() then return jsonb_build_object('status', 'busy'); end if;
  if c.attempts >= 5 then
    update public.scan_calibrations set state = 'refused', result = jsonb_build_object('reason', 'failed'), finished_at = now() where photo_id = p_id;
    return jsonb_build_object('status', 'refused');
  end if;
  update public.scan_calibrations set lease_token = p_token, lease_until = now() + make_interval(secs => p_lease_seconds), attempts = attempts + 1 where photo_id = p_id;
  return jsonb_build_object('status', 'started', 'previous', c.lease_token);
end $$;
