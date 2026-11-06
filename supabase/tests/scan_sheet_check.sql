-- Hosted probe for the sheet check's stored results (migration 20261105_scan_sheet_check.sql, #456 S3a). Post it to the
-- Supabase Management API (/v1/projects/cdjobwsyzndtltzfpyqa/database/query, Keychain token supabase-pagewise). A pass is
-- the error PROBE_OK: the final exception rolls back every synthetic row. No Storage objects and no provider calls.
--
-- 1. Send records a ready page only when its result passed the sheet check (result.sheetCheck, a number, 1 or more).
-- 2. reopen_scan_calibration takes an older ready result back under a new lease, naming the lease it replaced, and
--    answers as begin_scan_calibration for a current, running or refused result; a browser role cannot call it.
begin;
do $$
declare p uuid := gen_random_uuid(); c uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  pg uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  cur uuid := gen_random_uuid(); old uuid := gen_random_uuid(); text_version uuid := gen_random_uuid(); refused uuid := gen_random_uuid(); run uuid := gen_random_uuid();
  old_lease uuid := gen_random_uuid(); cur_lease uuid := gen_random_uuid(); t uuid := gen_random_uuid();
  rv text := substr(md5(gen_random_uuid()::text), 1, 28); a jsonb; k public.scan_calibrations; sent uuid[]; n int;
begin
  insert into auth.users(id, email) values (p, p::text || '@example.invalid');
  insert into public.parents(id, name, email, postal) values (p, 'Probe parent', p::text || '@example.invalid', 'V6B 1A1');
  insert into public.children(id, parent_id, first_name, grade, province) values (c, p, 'Probe', 3, 'BC');
  insert into public.workbooks(id, parent_id, child_id, number, levels, status, approved_at, printed_at, shipped_at, printed_revision)
    values (b, p, c, 1, '{4}', 'draft', now(), now(), now(), rv);
  for n in 1..5 loop
    insert into public.workbook_pages(id, parent_id, workbook_id, page_number, day_label, page_type, qr_token, print_contract)
      values (pg[n], p, b, 9 + n, 'Day 4', 'practice', 'probe' || replace(gen_random_uuid()::text, '-', ''), '{}');
  end loop;
  update public.workbooks set status = 'shipped' where id = b;
  insert into public.scan_photos(id, parent_id, child_id, page_id, workbook_id, printed_revision, state, reserved_bytes, stored_bytes, width, height, created_at, expires_at) values
    (cur,          p, c, pg[1], b, rv, 'saved', 0, 1, 100, 100, now(), now() + interval '90 days'),
    (old,          p, c, pg[2], b, rv, 'saved', 0, 1, 100, 100, now(), now() + interval '90 days'),
    (text_version, p, c, pg[3], b, rv, 'saved', 0, 1, 100, 100, now(), now() + interval '90 days'),
    (refused,      p, c, pg[4], b, rv, 'saved', 0, 1, 100, 100, now(), now() + interval '90 days'),
    (run,          p, c, pg[5], b, rv, 'saved', 0, 1, 100, 100, now(), now() + interval '90 days');
  insert into public.scan_calibrations(photo_id, parent_id, printed_revision, state, lease_token, lease_until, result) values
    (cur,          p, rv, 'ready',   cur_lease, now(), '{"sheetCheck":1,"parts":["straight"]}'),
    (old,          p, rv, 'ready',   old_lease, now(), '{"parts":["straight"]}'),
    (text_version, p, rv, 'ready',   gen_random_uuid(), now(), '{"sheetCheck":"1","parts":["straight"]}'),
    (refused,      p, rv, 'refused', gen_random_uuid(), now(), '{"reason":"another-page"}'),
    (run,          p, rv, 'running', gen_random_uuid(), now() + interval '90 seconds', null);

  -- 1. Send.
  sent := public.send_scan_photos(p, c, array[cur, old, text_version, refused, run]);
  if sent <> array[cur] then raise exception 'sent %; want only the page whose result passed the sheet check', sent; end if;

  -- 2. Reopen an older ready result: running again, no result, the old lease named.
  a := public.reopen_scan_calibration(p, old, t, 1);
  if a->>'status' <> 'started' or a->>'previous' <> old_lease::text then raise exception 'reopen of an older result answered %', a; end if;
  select * into k from public.scan_calibrations where photo_id = old;
  if k.state <> 'running' or k.result is not null or k.lease_token <> t or k.lease_until <= now() or k.attempts <> 1 then raise exception 'reopened row %', row_to_json(k); end if;
  -- Its lease now holds: a second job waits.
  a := public.reopen_scan_calibration(p, old, gen_random_uuid(), 1);
  if a->>'status' <> 'busy' then raise exception 'second reopen answered %', a; end if;
  -- A version stored as text is not a version.
  a := public.reopen_scan_calibration(p, text_version, gen_random_uuid(), 1);
  if a->>'status' <> 'started' then raise exception 'reopen of a text version answered %', a; end if;
  -- A current, refused or running result answers as begin does, unchanged.
  a := public.reopen_scan_calibration(p, cur, gen_random_uuid(), 1);
  if a->>'status' <> 'ready' or (select lease_token from public.scan_calibrations where photo_id = cur) <> cur_lease then raise exception 'reopen of a current result answered %', a; end if;
  a := public.reopen_scan_calibration(p, refused, gen_random_uuid(), 1);
  if a->>'status' <> 'refused' then raise exception 'reopen of a refusal answered %', a; end if;
  a := public.reopen_scan_calibration(p, run, gen_random_uuid(), 1);
  if a->>'status' <> 'busy' then raise exception 'reopen of a running check answered %', a; end if;

  -- 3. An earlier Send record cannot override a recheck or refusal. Keep the history, require current evidence.
  update public.scan_photos set sent_at = now() - interval '1 day' where id = old;
  sent := public.send_scan_photos(p, c, array[old]);
  if cardinality(sent) <> 0 then raise exception 'sent a running recheck %', sent; end if;
  update public.scan_calibrations set state = 'ready', result = '{"parts":["straight"]}' where photo_id = old;
  sent := public.send_scan_photos(p, c, array[old]);
  if cardinality(sent) <> 0 then raise exception 'sent an old check %', sent; end if;
  update public.scan_calibrations set state = 'refused', result = '{"reason":"faint"}' where photo_id = old;
  sent := public.send_scan_photos(p, c, array[old]);
  if cardinality(sent) <> 0 then raise exception 'sent a refused recheck %', sent; end if;
  update public.scan_calibrations set state = 'ready', result = '{"sheetCheck":1,"parts":["straight"]}' where photo_id = old;
  sent := public.send_scan_photos(p, c, array[old]);
  if sent <> array[old] then raise exception 'lost a valid earlier Send %', sent; end if;
  if (select sent_at from public.scan_photos where id = old) <> now() - interval '1 day' then raise exception 'changed Send history'; end if;
  update public.scan_photos set expires_at = now() - interval '1 second' where id = old;
  sent := public.send_scan_photos(p, c, array[old]);
  if cardinality(sent) <> 0 then raise exception 'sent an expired earlier Send %', sent; end if;

  -- A browser role cannot reopen.
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.reopen_scan_calibration(p, cur, gen_random_uuid(), 1);
    raise exception 'browser role called reopen';
  exception when insufficient_privilege then null;
  end;
  reset role;

  delete from public.parents where parents.id = p;
  if exists (select 1 from public.scan_calibrations where parent_id = p) then raise exception 'family deletion left calibrations'; end if;
  raise exception 'PROBE_OK';
end $$;
