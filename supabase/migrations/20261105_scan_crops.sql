-- Scan crops (#455, S2b): a photo's calibration and the files derived from it (the straightened page and numbered crops).
-- Additive: one new table, new functions, and a wider Storage fence that still admits S1's exact photo path as before.
--
-- Files stay flat beside the photo: <parent>/<photo>/<lease token>-straight.jpg and <lease token>-crop-<n>.jpg. So every
-- rule that covers a photo's folder already covers them: the restrictive browser policy on the bucket, reconcile_scan_cleanup,
-- the family worker's folder drain and complete_family_deletion.
--
-- A derived file needs an active, unexpired photo revision and the current lease. Both are read with a share lock in the
-- Storage fence, so a terminal photo update waits for a write in progress, and a write after it finds no active row.
-- Rows hold geometry only, never image bytes or answer text. They go with the photo (cascade) and with the family.

create unique index scan_photos_family_id on public.scan_photos(id, parent_id);

create table public.scan_calibrations (
  photo_id uuid primary key,
  parent_id uuid not null,
  printed_revision text not null,
  state text not null check (state in ('running', 'ready', 'refused')),
  lease_token uuid not null,
  lease_until timestamptz not null,
  attempts int not null default 1 check (attempts >= 1),
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint scan_calibration_photo foreign key (photo_id, parent_id) references public.scan_photos(id, parent_id) on delete cascade,
  constraint scan_calibration_result check ((state = 'running') = (result is null))
);
alter table public.scan_calibrations enable row level security;
revoke all on public.scan_calibrations from anon, authenticated;
grant all on public.scan_calibrations to service_role;
grant select on public.scan_calibrations to authenticated;
-- Job internals: admins read, the family reads through the checked preview route only.
create policy scan_calibration_admin_read on public.scan_calibrations for select to authenticated using ((select public.is_admin()));
create trigger fence_family_write before insert or update on public.scan_calibrations
  for each row execute function public.fence_family_write();

-- The same rule as the abandonment margin in expire_scan_photos: a photo not saved in time is no longer active, even before
-- the scheduled expiry records it.
create function public.scan_photo_is_active(p_state text, p_created timestamptz, p_expires timestamptz) returns boolean
language sql stable set search_path = '' as $$
  select p_expires > now() and (p_state = 'saved' or (p_state = 'pending' and p_created > now() - interval '23 hours 30 minutes'));
$$;
revoke all on function public.scan_photo_is_active(text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.scan_photo_is_active(text, timestamptz, timestamptz) to service_role;

-- Starts or takes over one photo's calibration under a new lease. Parent, then photo: the order of expiry and deletion.
create function public.begin_scan_calibration(p_parent uuid, p_id uuid, p_token uuid, p_lease_seconds int default 90) returns jsonb
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
    return jsonb_build_object('status', 'started');
  end if;
  if c.state <> 'running' then return jsonb_build_object('status', c.state); end if;
  if c.lease_until > now() then return jsonb_build_object('status', 'busy'); end if;
  if c.attempts >= 5 then
    update public.scan_calibrations set state = 'refused', result = jsonb_build_object('reason', 'failed'), finished_at = now() where photo_id = p_id;
    return jsonb_build_object('status', 'refused');
  end if;
  update public.scan_calibrations set lease_token = p_token, lease_until = now() + make_interval(secs => p_lease_seconds), attempts = attempts + 1 where photo_id = p_id;
  return jsonb_build_object('status', 'started');
end $$;

-- Only the lease holder of an active photo finishes, and a ready result must name files that really exist.
create function public.finish_scan_calibration(p_parent uuid, p_id uuid, p_token uuid, p_state text, p_result jsonb, p_bytes bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare r public.scan_photos; c public.scan_calibrations; l public.scan_limits;
begin
  perform public.assert_family_writable(p_parent);
  select * into r from public.scan_photos where id = p_id and parent_id = p_parent for update;
  if not found then return 'unknown'; end if;
  if not public.scan_photo_is_active(r.state, r.created_at, r.expires_at) then return 'terminal'; end if;
  select * into c from public.scan_calibrations where photo_id = p_id for update;
  if not found or c.state <> 'running' or c.lease_token <> p_token or c.lease_until <= now() then return 'stale'; end if;
  if p_state not in ('ready', 'refused') or jsonb_typeof(p_result) is distinct from 'object' then return 'invalid'; end if;
  if p_state = 'ready' then
    select * into l from public.scan_limits where singleton;
    if p_bytes is null or p_bytes < 1 or p_bytes > l.output_bytes or jsonb_typeof(p_result->'parts') is distinct from 'array' then return 'invalid'; end if;
    if exists (
      select 1 from jsonb_array_elements_text(p_result->'parts') part where not exists (
        select 1 from storage.objects o where o.bucket_id = 'scan-photos'
          and o.name = p_parent::text || '/' || p_id::text || '/' || p_token::text || '-' || part.value || '.jpg')
    ) then return 'missing'; end if;
    update public.scan_photos set stored_bytes = stored_bytes + p_bytes where id = p_id;
  end if;
  update public.scan_calibrations set state = p_state, result = p_result, finished_at = now() where photo_id = p_id;
  return p_state;
end $$;

revoke all on function public.begin_scan_calibration(uuid, uuid, uuid, int) from public, anon, authenticated;
revoke all on function public.finish_scan_calibration(uuid, uuid, uuid, text, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.begin_scan_calibration(uuid, uuid, uuid, int) to service_role;
grant execute on function public.finish_scan_calibration(uuid, uuid, uuid, text, jsonb, bigint) to service_role;

-- The exact photo path as in S1, and now the derived files of the current lease. The row locks serialize even secret-key
-- writes with terminal deletion and expiry.
create or replace function public.fence_scan_object() returns trigger
language plpgsql security definer set search_path = '' as $$
declare file text; part text[];
begin
  if tg_op = 'UPDATE' and old.bucket_id = 'scan-photos' then raise exception 'scan_objects_immutable'; end if;
  if new.bucket_id = 'scan-photos' then
    perform public.assert_family_writable(split_part(new.name, '/', 1)::uuid);
    file := split_part(new.name, '/', 3);
    if file = 'photo.jpg' then
      perform 1 from public.scan_photos where parent_id = split_part(new.name, '/', 1)::uuid
        and id = split_part(new.name, '/', 2)::uuid and new.name = parent_id::text || '/' || id::text || '/photo.jpg'
        and state = 'processing' and page_id is not null and lease_until > now() and expires_at > now() for share;
      if not found then raise exception 'scan_revision_unavailable'; end if;
    else
      part := regexp_match(file, '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-(straight|crop-[0-9]{1,3})\.jpg$');
      if part is null then raise exception 'scan_revision_unavailable'; end if;
      perform 1 from public.scan_photos where parent_id = split_part(new.name, '/', 1)::uuid
        and id = split_part(new.name, '/', 2)::uuid and new.name = parent_id::text || '/' || id::text || '/' || file
        and public.scan_photo_is_active(state, created_at, expires_at) for share;
      if not found then raise exception 'scan_revision_unavailable'; end if;
      perform 1 from public.scan_calibrations where photo_id = split_part(new.name, '/', 2)::uuid
        and lease_token = part[1]::uuid and state = 'running' and lease_until > now() for share;
      if not found then raise exception 'scan_revision_unavailable'; end if;
    end if;
  end if;
  return new;
end $$;
