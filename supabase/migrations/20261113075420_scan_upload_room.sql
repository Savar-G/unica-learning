-- #915: one stuck or waiting upload must not block the rest, and photos saved for marking must not block new uploads.
-- Replaces two functions with the same signatures (additive: the live site keeps working before and after the deploy).
--
-- admit_scan_photo, two changes, every other check as in 20261105_scan_marking.sql:
--   1. The upload slot (concurrent_uploads, default 2) counts photos whose upload is running ('processing', live lease)
--      and reservations made in the last 2 minutes. A reservation whose upload never started (a hung phone, a closed tab)
--      stops holding the slot after 2 minutes instead of its whole 10-minute lease. Its lease is unchanged, so a late
--      upload of it still works; start_scan_photo below still caps the uploads that actually run.
--   2. The queue cap (active_jobs + queued_jobs, default 1 + 8) counts only photos not saved yet (reserved and
--      processing with a live lease, and pending). Saved photos waiting for Send or for marking no longer count, so a
--      family with 14 saved pages (2026-11-13) can keep scanning, and marking being down never blocks uploads.
--      The marking queue keeps its own cap at the claim (scan_marking_command 'claim': active plus queued jobs answer
--      'busy' and the cron retries), and uploads stay bounded by 40 per 10 minutes, 60 a day and the family bytes.
-- start_scan_photo: an upload may start while fewer than concurrent_uploads uploads of the family run (D-271: 2 uploads
--   at once). Before, it waited for the family's one processing slot, shared with photo checks and marking, so a
--   running marking job (lease up to 180 s) held every upload. Checks and marking still wait for running uploads
--   (scan_active_jobs is unchanged and still counts them), and the photo check and marking claims are unchanged.
create or replace function public.admit_scan_photo(p_parent uuid,p_child uuid,p_id uuid,p_bytes bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare l public.scan_limits; r public.scan_photos; n int; b bigint;
begin
  perform public.assert_family_writable(p_parent);
  perform pg_advisory_xact_lock(hashtextextended('scan:' || p_parent::text,0));
  select * into l from public.scan_limits where singleton;
  select * into r from public.scan_photos where id=p_id;
  if found then
    if r.parent_id=p_parent and r.child_id=p_child then return r.state; end if;
    return 'refused';
  end if;
  if p_bytes is null or p_bytes < 1 or p_bytes > l.input_bytes then return 'size'; end if;
  if not exists(select 1 from public.workbooks where parent_id=p_parent and child_id=p_child and status='shipped') then return 'page'; end if;
  select count(*) into n from public.scan_photos where parent_id=p_parent and created_at>now()-interval '10 minutes';
  if n>=l.per_ten_minutes then return 'frequency'; end if;
  select count(*) into n from public.scan_photos where parent_id=p_parent and created_at>now()-interval '1 day';
  if n>=l.per_day then return 'frequency'; end if;
  select count(*) into n from public.scan_photos where parent_id=p_parent and lease_until>now()
    and (state='processing' or (state='reserved' and created_at>now()-interval '2 minutes'));
  if n>=l.concurrent_uploads then return 'busy'; end if;
  select count(*) into n from public.scan_photos where parent_id=p_parent and expires_at>now()
    and ((state in ('reserved','processing') and lease_until>now()) or state='pending');
  if n>=l.active_jobs+l.queued_jobs then return 'busy'; end if;
  select coalesce(sum(reserved_bytes+stored_bytes),0) into b from public.scan_photos where parent_id=p_parent;
  if b+l.output_bytes>l.family_bytes then return 'quota'; end if;
  insert into public.scan_photos(id,parent_id,child_id,reserved_bytes) values(p_id,p_parent,p_child,l.output_bytes);
  return 'reserved';
end $$;

create or replace function public.start_scan_photo(p_parent uuid,p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare r public.scan_photos; l public.scan_limits; n int;
begin
  perform public.assert_family_writable(p_parent);
  perform pg_advisory_xact_lock(hashtextextended('scan:' || p_parent::text,0));
  select * into r from public.scan_photos where id=p_id and parent_id=p_parent for update;
  if not found then return 'refused'; end if;
  if r.state<>'reserved' then return r.state; end if;
  if r.lease_until<=clock_timestamp() or r.expires_at<=clock_timestamp() then return 'expired'; end if;
  select * into l from public.scan_limits where singleton;
  select count(*) into n from public.scan_photos where parent_id=p_parent and state='processing'
    and lease_until>clock_timestamp() and expires_at>clock_timestamp();
  if n>=l.concurrent_uploads then return 'busy'; end if;
  update public.scan_photos set state='processing' where id=p_id;
  return 'started';
end $$;

-- create or replace keeps the existing grants; restated so the file stands alone.
revoke all on function public.admit_scan_photo(uuid,uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.admit_scan_photo(uuid,uuid,uuid,bigint) to service_role;
revoke all on function public.start_scan_photo(uuid,uuid) from public,anon,authenticated;
grant execute on function public.start_scan_photo(uuid,uuid) to service_role;
