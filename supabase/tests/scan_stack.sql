-- Hosted probe for the Scan pages stack (migration 20261105_scan_stack.sql). Post it to the Supabase Management API
-- (/v1/projects/cdjobwsyzndtltzfpyqa/database/query, Keychain token supabase-pagewise). A pass is the error PROBE_OK:
-- the final exception rolls back every synthetic row. No Storage objects and no provider calls.
--
-- 1. D-271: 40 photos per 10 minutes and 60 a day, refused photos counted, at the exact boundary.
-- 2. D-270: Send records only the family's own ready pages (saved, active, checked ready on the photo's own printing,
--    not sent before), once, and a browser role cannot call it.
begin;
do $$
declare p uuid := gen_random_uuid(); q uuid := gen_random_uuid(); c uuid := gen_random_uuid(); cq uuid := gen_random_uuid();
  b uuid := gen_random_uuid(); bq uuid := gen_random_uuid();
  pg uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  pgq uuid := gen_random_uuid();
  ready uuid := gen_random_uuid(); running uuid := gen_random_uuid(); refused uuid := gen_random_uuid(); pending uuid := gen_random_uuid();
  older uuid := gen_random_uuid(); expired uuid := gen_random_uuid(); other uuid := gen_random_uuid();
  photo uuid; r text; n int; sent uuid[]; first_sent timestamptz; l public.scan_limits;
begin
  insert into auth.users(id, email) values (p, p::text || '@example.invalid'), (q, q::text || '@example.invalid');
  insert into public.parents(id, name, email, postal) values (p, 'Probe parent', p::text || '@example.invalid', 'V6B 1A1'), (q, 'Probe other', q::text || '@example.invalid', 'V6B 1A1');
  insert into public.children(id, parent_id, first_name, grade, province) values (c, p, 'Probe', 3, 'BC'), (cq, q, 'Other', 3, 'BC');
  insert into public.workbooks(id, parent_id, child_id, number, levels, status, approved_at, printed_at, shipped_at)
    values (b, p, c, 1, '{4}', 'draft', now(), now(), now()), (bq, q, cq, 1, '{4}', 'draft', now(), now(), now());
  for n in 1..6 loop
    insert into public.workbook_pages(id, parent_id, workbook_id, page_number, day_label, page_type, qr_token)
      values (pg[n], p, b, 9 + n, 'Day 4', 'practice', 'probe' || replace(gen_random_uuid()::text, '-', ''));
  end loop;
  insert into public.workbook_pages(id, parent_id, workbook_id, page_number, day_label, page_type, qr_token)
    values (pgq, q, bq, 10, 'Day 4', 'practice', 'probe' || replace(gen_random_uuid()::text, '-', ''));
  update public.workbooks set status = 'shipped' where id in (b, bq);

  -- 1. The limits.
  select * into l from public.scan_limits where singleton;
  if l.per_ten_minutes <> 40 or l.per_day <> 60 or l.concurrent_uploads <> 2 then
    raise exception 'limits are %/10 min, %/day, % at once; want 40, 60, 2', l.per_ten_minutes, l.per_day, l.concurrent_uploads;
  end if;
  -- 39 photos in the last ten minutes, all refused: refused photos still count (D-271).
  insert into public.scan_photos(id, parent_id, child_id, state, reserved_bytes, terminal_at)
    select gen_random_uuid(), p, c, 'rejected', 0, now() from generate_series(1, 39);
  photo := gen_random_uuid();
  r := public.admit_scan_photo(p, c, photo, 1000);
  if r <> 'reserved' then raise exception 'photo 40 in ten minutes: %', r; end if;
  update public.scan_photos set state = 'rejected', terminal_at = now(), reserved_bytes = 0 where scan_photos.id = photo;
  r := public.admit_scan_photo(p, c, gen_random_uuid(), 1000);
  if r <> 'frequency' then raise exception 'photo 41 in ten minutes: %', r; end if;
  -- The day: move those 40 out of the ten minutes, add 19 more in the day, so photo 60 is the last one.
  update public.scan_photos set created_at = now() - interval '1 hour' where parent_id = p;
  insert into public.scan_photos(id, parent_id, child_id, state, reserved_bytes, terminal_at, created_at)
    select gen_random_uuid(), p, c, 'rejected', 0, now(), now() - interval '1 hour' from generate_series(1, 19);
  photo := gen_random_uuid();
  r := public.admit_scan_photo(p, c, photo, 1000);
  if r <> 'reserved' then raise exception 'photo 60 in a day: %', r; end if;
  update public.scan_photos set state = 'rejected', terminal_at = now(), reserved_bytes = 0 where scan_photos.id = photo;
  r := public.admit_scan_photo(p, c, gen_random_uuid(), 1000);
  if r <> 'frequency' then raise exception 'photo 61 in a day: %', r; end if;

  -- 2. Send. One photo per page; calibrations written as the job writes them.
  insert into public.scan_photos(id, parent_id, child_id, page_id, workbook_id, printed_revision, state, reserved_bytes, stored_bytes, width, height, created_at, expires_at) values
    (ready,   p, c, pg[1], b, 'r1', 'saved',   0, 1, 100, 100, now(), now() + interval '90 days'),
    (running, p, c, pg[2], b, 'r1', 'saved',   0, 1, 100, 100, now(), now() + interval '90 days'),
    (refused, p, c, pg[3], b, 'r1', 'saved',   0, 1, 100, 100, now(), now() + interval '90 days'),
    (pending, p, c, pg[4], b, 'r1', 'pending', 0, 1, 100, 100, now(), now() + interval '90 days'),
    (older,   p, c, pg[5], b, 'r0', 'saved',   0, 1, 100, 100, now(), now() + interval '90 days'),
    (expired, p, c, pg[6], b, 'r1', 'saved',   0, 1, 100, 100, now() - interval '91 days', now() - interval '1 day'),
    (other,   q, cq, pgq, bq, 'r1', 'saved',   0, 1, 100, 100, now(), now() + interval '90 days');
  insert into public.scan_calibrations(photo_id, parent_id, printed_revision, state, lease_token, lease_until, result) values
    (ready,   p, 'r1', 'ready',   gen_random_uuid(), now(), '{}'),
    (running, p, 'r1', 'running', gen_random_uuid(), now() + interval '90 seconds', null),
    (refused, p, 'r1', 'refused', gen_random_uuid(), now(), '{"reason":"marks-missing"}'),
    (pending, p, 'r1', 'ready',   gen_random_uuid(), now(), '{}'),
    (older,   p, 'r1', 'ready',   gen_random_uuid(), now(), '{}'),
    (expired, p, 'r1', 'ready',   gen_random_uuid(), now(), '{}'),
    (other,   q, 'r1', 'ready',   gen_random_uuid(), now(), '{}');

  sent := public.send_scan_photos(p, c, array[ready, running, refused, pending, older, expired, other]);
  if sent <> array[ready] then raise exception 'sent %; want only the ready page', sent; end if;
  select sent_at into first_sent from public.scan_photos where scan_photos.id = ready;
  if first_sent is null then raise exception 'sent_at not recorded'; end if;
  if (select count(*) from public.scan_photos where sent_at is not null) <> 1 then raise exception 'another photo was marked sent'; end if;
  -- A retry answers the same and keeps the first time.
  sent := public.send_scan_photos(p, c, array[ready]);
  if sent <> array[ready] or (select sent_at from public.scan_photos where scan_photos.id = ready) <> first_sent then raise exception 'retry changed the send'; end if;
  -- Another child or another family cannot send or see these pages as sent.
  if public.send_scan_photos(p, cq, array[ready, other]) <> '{}'::uuid[] then raise exception 'sent for another child'; end if;
  if public.send_scan_photos(q, cq, array[ready, other]) <> array[other] then raise exception 'other family send'; end if;
  if cardinality(public.send_scan_photos(p, c, '{}')) <> 0 then raise exception 'empty send'; end if;

  -- The owner reads sent_at; a browser role cannot call Send.
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.scan_photos where sent_at is not null;
  if n <> 1 then raise exception 'owner reads % sent photos', n; end if;
  begin
    perform public.send_scan_photos(p, c, array[running]);
    raise exception 'browser role called send';
  exception when insufficient_privilege then null;
  end;
  reset role;

  delete from public.parents where parents.id in (p, q);
  if exists (select 1 from public.scan_photos where parent_id in (p, q)) then raise exception 'family deletion left photos'; end if;
  raise exception 'PROBE_OK';
end $$;
