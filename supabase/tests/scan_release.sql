-- Hosted probe for release_scan_photo (migration 20261105_scan_release.sql). Post it to the Supabase Management API
-- (/v1/projects/cdjobwsyzndtltzfpyqa/database/query, Keychain token supabase-pagewise). A pass is the error PROBE_OK:
-- the final exception rolls back every synthetic row. No Storage objects and no provider calls.
--
-- Release lets go of an upload slot. It acts only on a reservation whose upload has not started. It never changes a
-- photo that is processing, pending or saved, and never another family's photo.
begin;
do $$
declare p uuid := gen_random_uuid(); q uuid := gen_random_uuid(); c uuid := gen_random_uuid(); cq uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  pg1 uuid := gen_random_uuid(); pg2 uuid := gen_random_uuid();
  a uuid := gen_random_uuid(); d uuid := gen_random_uuid(); e uuid := gen_random_uuid(); left_pending uuid := gen_random_uuid(); kept uuid := gen_random_uuid();
  r text; row_after public.scan_photos;
begin
  insert into auth.users(id, email) values (p, p::text || '@example.invalid'), (q, q::text || '@example.invalid');
  insert into public.parents(id, name, email, postal) values (p, 'Probe parent', p::text || '@example.invalid', 'V6B 1A1'), (q, 'Probe other', q::text || '@example.invalid', 'V6B 1A1');
  insert into public.children(id, parent_id, first_name, grade, province) values (c, p, 'Probe', 3, 'BC'), (cq, q, 'Other', 3, 'BC');
  insert into public.workbooks(id, parent_id, child_id, number, levels, status, approved_at, printed_at, shipped_at) values (b, p, c, 1, '{4}', 'draft', now(), now(), now());
  insert into public.workbook_pages(id, parent_id, workbook_id, page_number, day_label, page_type, qr_token) values
    (pg1, p, b, 10, 'Day 4', 'practice', 'probe' || replace(gen_random_uuid()::text, '-', '')),
    (pg2, p, b, 11, 'Day 4', 'practice', 'probe' || replace(gen_random_uuid()::text, '-', ''));
  update public.workbooks set status = 'shipped' where id = b;

  -- A reservation lets go, and its slot and bytes are free at once. Two slots are full, so a third photo is busy until then.
  if public.admit_scan_photo(p, c, a, 1000) <> 'reserved' then raise exception 'first admission'; end if;
  if public.admit_scan_photo(p, c, d, 1000) <> 'reserved' then raise exception 'second admission'; end if;
  if public.admit_scan_photo(p, c, e, 1000) <> 'busy' then raise exception 'slots were not full'; end if;
  -- Another family, and a photo that does not exist, get the same refusal and change nothing.
  r := public.release_scan_photo(q, a);
  if r <> 'refused' or (select state from public.scan_photos where id = a) <> 'reserved' then raise exception 'other family release: %', r; end if;
  if public.release_scan_photo(p, gen_random_uuid()) <> 'refused' then raise exception 'unknown photo release'; end if;
  r := public.release_scan_photo(p, a);
  if r <> 'released' then raise exception 'reservation release: %', r; end if;
  select * into row_after from public.scan_photos where id = a;
  if row_after.state <> 'rejected' or row_after.terminal_at is null or row_after.reserved_bytes <> 0 then raise exception 'released row: %', row_after; end if;
  if public.admit_scan_photo(p, c, e, 1000) <> 'reserved' then raise exception 'the slot was not freed'; end if;
  -- A released id cannot start an upload, is not released twice, and answers its end at admission.
  if public.start_scan_photo(p, a) <> 'rejected' then raise exception 'released photo started'; end if;
  if public.release_scan_photo(p, a) <> 'rejected' then raise exception 'second release'; end if;
  if public.admit_scan_photo(p, c, a, 1000) <> 'rejected' then raise exception 'released id admitted again'; end if;

  -- An upload that started is not released.
  if public.start_scan_photo(p, d) <> 'started' then raise exception 'start'; end if;
  r := public.release_scan_photo(p, d);
  if r <> 'processing' or (select state from public.scan_photos where id = d) <> 'processing' then raise exception 'processing release: %', r; end if;

  -- The Codex sequence: the photo reached the server and only its answers were lost. Pending and saved photos stay whole.
  insert into public.scan_photos(id, parent_id, child_id, page_id, workbook_id, printed_revision, state, reserved_bytes, stored_bytes, width, height, created_at, expires_at) values
    (left_pending, p, c, pg1, b, 'r1', 'pending', 0, 5, 100, 100, now(), now() + interval '90 days'),
    (kept,         p, c, pg2, b, 'r1', 'saved',   0, 7, 100, 100, now(), now() + interval '90 days');
  r := public.release_scan_photo(p, left_pending);
  select * into row_after from public.scan_photos where id = left_pending;
  if r <> 'pending' or row_after.state <> 'pending' or row_after.stored_bytes <> 5 or row_after.terminal_at is not null then raise exception 'pending release: %, %', r, row_after; end if;
  r := public.release_scan_photo(p, kept);
  select * into row_after from public.scan_photos where id = kept;
  if r <> 'saved' or row_after.state <> 'saved' or row_after.stored_bytes <> 7 or row_after.terminal_at is not null then raise exception 'saved release: %, %', r, row_after; end if;
  -- A browser role cannot call it.
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.release_scan_photo(p, e);
    raise exception 'browser role called release';
  exception when insufficient_privilege then null;
  end;
  reset role;

  delete from public.parents where parents.id in (p, q);
  raise exception 'PROBE_OK';
end $$;
