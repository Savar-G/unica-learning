-- Hosted probe for migration 20261113075420_scan_upload_room.sql (#915). Post it to the Supabase Management API
-- (/v1/projects/cdjobwsyzndtltzfpyqa/database/query, Keychain token supabase-pagewise) after the migration is applied.
-- A pass is the error PROBE_OK: the final exception rolls back every synthetic row. No Storage objects, no provider calls.
--
-- 1. Saved photos (sent or not, marked or not) no longer make admission answer busy (the 2026-11-13 test: 14 saved).
-- 2. Photos not saved yet (reserved, processing, pending) still cap at active_jobs + queued_jobs (1 + 8).
-- 3. A reservation older than 2 minutes whose upload never started stops holding an upload slot.
-- 4. Two uploads may run at once (D-271), a third waits, and a running photo check does not hold uploads.
begin;
do $$
declare p uuid := gen_random_uuid(); c uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  pg uuid[] := array[]::uuid[]; photo uuid; r text; n int; l public.scan_limits; one uuid; two uuid; three uuid;
begin
  select * into l from public.scan_limits where singleton;
  if l.concurrent_uploads <> 2 or l.active_jobs <> 1 or l.queued_jobs <> 8 then
    raise exception 'limits are % at once, % + % jobs; want 2, 1 + 8', l.concurrent_uploads, l.active_jobs, l.queued_jobs;
  end if;
  insert into auth.users(id, email) values (p, p::text || '@example.invalid');
  insert into public.parents(id, name, email, postal) values (p, 'Probe parent', p::text || '@example.invalid', 'V6B 1A1');
  insert into public.children(id, parent_id, first_name, grade, province) values (c, p, 'Probe', 3, 'BC');
  insert into public.workbooks(id, parent_id, child_id, number, levels, status, approved_at, printed_at, shipped_at)
    values (b, p, c, 1, '{4}', 'draft', now(), now(), now());
  for n in 1..24 loop
    pg := pg || gen_random_uuid();
    insert into public.workbook_pages(id, parent_id, workbook_id, page_number, day_label, page_type, qr_token)
      values (pg[n], p, b, n, 'Day ' || ((n - 1) / 8 + 1), 'practice', 'probe' || replace(gen_random_uuid()::text, '-', ''));
  end loop;
  update public.workbooks set status = 'shipped' where id = b;
  -- Older than the 10-minute window, so only the rules under test answer.
  -- 1. 14 saved photos, none marked: 8 not sent, 6 sent.
  insert into public.scan_photos(id, parent_id, child_id, page_id, workbook_id, printed_revision, state, reserved_bytes, stored_bytes, width, height, created_at, expires_at, sent_at)
    select gen_random_uuid(), p, c, pg[i], b, 'r1', 'saved', 0, 1, 100, 100, now() - interval '1 hour', now() + interval '90 days',
      case when i > 8 then now() - interval '30 minutes' end from generate_series(1, 14) i;
  photo := gen_random_uuid();
  r := public.admit_scan_photo(p, c, photo, 1000);
  if r <> 'reserved' then raise exception '14 saved photos: admission answers %; want reserved', r; end if;
  delete from public.scan_photos where id = photo;

  -- 2. 9 photos not saved yet (pending, an hour old so outside the slot): the queue cap still answers busy.
  insert into public.scan_photos(id, parent_id, child_id, page_id, workbook_id, printed_revision, state, reserved_bytes, stored_bytes, width, height, created_at, expires_at)
    select gen_random_uuid(), p, c, pg[i], b, 'r1', 'pending', 0, 1, 100, 100, now() - interval '1 hour', now() + interval '90 days' from generate_series(15, 23) i;
  r := public.admit_scan_photo(p, c, gen_random_uuid(), 1000);
  if r <> 'busy' then raise exception '9 pending photos: admission answers %; want busy', r; end if;
  update public.scan_photos set state = 'saved' where parent_id = p and state = 'pending';

  -- 3. Two reservations made 3 minutes ago, never uploaded: they no longer hold the slot. Two fresh ones do.
  insert into public.scan_photos(id, parent_id, child_id, reserved_bytes, created_at)
    select gen_random_uuid(), p, c, 1, now() - interval '3 minutes' from generate_series(1, 2);
  one := gen_random_uuid(); two := gen_random_uuid(); three := gen_random_uuid();
  r := public.admit_scan_photo(p, c, one, 1000);
  if r <> 'reserved' then raise exception 'stale reservations: admission answers %; want reserved', r; end if;
  r := public.admit_scan_photo(p, c, two, 1000);
  if r <> 'reserved' then raise exception 'second fresh reservation: %; want reserved', r; end if;
  r := public.admit_scan_photo(p, c, three, 1000);
  if r <> 'busy' then raise exception 'third fresh reservation: %; want busy (2 uploads at once)', r; end if;
  delete from public.scan_photos where parent_id = p and state = 'reserved' and id not in (one, two);

  -- 4. A running photo check on a saved photo does not hold the uploads; two run at once, a third waits.
  insert into public.scan_calibrations(photo_id, parent_id, printed_revision, state, lease_token, lease_until, result)
    select id, p, 'r1', 'running', gen_random_uuid(), now() + interval '90 seconds', null from public.scan_photos
      where parent_id = p and state = 'saved' and sent_at is null limit 1;
  r := public.start_scan_photo(p, one);
  if r <> 'started' then raise exception 'first upload beside a running check: %; want started', r; end if;
  r := public.start_scan_photo(p, two);
  if r <> 'started' then raise exception 'second upload: %; want started', r; end if;
  insert into public.scan_photos(id, parent_id, child_id, reserved_bytes) values (three, p, c, 1);
  r := public.start_scan_photo(p, three);
  if r <> 'busy' then raise exception 'third upload: %; want busy', r; end if;

  delete from public.parents where parents.id = p;
  raise exception 'PROBE_OK';
end $$;
