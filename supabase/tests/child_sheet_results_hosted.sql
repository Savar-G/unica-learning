-- Hosted assertions for UNI-243 (migration 20261127205443_child_sheet_results). Every synthetic family, child, book and
-- result rolls back. Run it through the Management API query endpoint; it answers one row of named checks or an error.
begin;
set local statement_timeout = '15s';
do $$
declare
  p uuid := gen_random_uuid(); c uuid := gen_random_uuid(); c2 uuid := gen_random_uuid();
  admin_uid uuid := gen_random_uuid(); photo uuid := gen_random_uuid();
  future_sent timestamptz := now() + interval '1 day';
  w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid(); w_dup uuid := gen_random_uuid();
  rev text := repeat('a', 28);
  row_of jsonb := jsonb_build_array(jsonb_build_object('workbookId', w, 'printedRevision', rev, 'sheetId', 'probe-sheet', 'attempt', 1, 'itemsTotal', 16, 'itemsScored', 10, 'mistakes', 1, 'result', 'unknown'));
  r jsonb; n integer; role_name text; checks text[] := '{}';
begin
  -- Grants: browser roles write nothing and call nothing; only the service role runs the writer.
  if (select count(*) from pg_class where oid in ('public.child_sheet_results'::regclass, 'public.child_bank_state'::regclass) and relrowsecurity) <> 2 then raise exception 'rls_missing'; end if;
  foreach role_name in array array['anon', 'authenticated'] loop
    if has_table_privilege(role_name, 'public.child_sheet_results', 'INSERT') or has_table_privilege(role_name, 'public.child_sheet_results', 'UPDATE')
      or has_table_privilege(role_name, 'public.child_sheet_results', 'DELETE') or has_table_privilege(role_name, 'public.child_bank_state', 'INSERT')
      or has_table_privilege(role_name, 'public.child_bank_state', 'UPDATE') or has_table_privilege(role_name, 'public.child_bank_state', 'DELETE') then raise exception 'browser_write_grant %', role_name; end if;
    if has_function_privilege(role_name, 'public.write_child_sheet_results(uuid,bigint,jsonb)', 'EXECUTE') then raise exception 'browser_writer_grant %', role_name; end if;
  end loop;
  if has_table_privilege('anon', 'public.child_sheet_results', 'SELECT') or has_table_privilege('anon', 'public.child_bank_state', 'SELECT') then raise exception 'anon_read_grant'; end if;
  if exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name in ('child_sheet_results', 'child_bank_state') and grantee = 'PUBLIC') then raise exception 'public_grant'; end if;
  if has_function_privilege('public', 'public.write_child_sheet_results(uuid,bigint,jsonb)', 'EXECUTE') then raise exception 'public_writer_grant'; end if;
  if has_function_privilege('public', 'public.mark_sheet_results_revision(uuid,bigint)', 'EXECUTE') then raise exception 'public_rev_grant'; end if;
  if has_function_privilege('anon', 'public.mark_sheet_results_revision(uuid,bigint)', 'EXECUTE') or has_function_privilege('authenticated', 'public.mark_sheet_results_revision(uuid,bigint)', 'EXECUTE') then raise exception 'browser_rev_grant'; end if;
  if not has_function_privilege('service_role', 'public.write_child_sheet_results(uuid,bigint,jsonb)', 'EXECUTE') then raise exception 'service_writer_missing'; end if;
  if not has_function_privilege('service_role', 'public.mark_sheet_results_revision(uuid,bigint)', 'EXECUTE') then raise exception 'service_rev_missing'; end if;
  checks := array_append(checks, 'grants'::text);

  -- A synthetic family + synthetic admin: two children, one book each with one issued sheet attempt.
  insert into auth.users(id, email) values (p, p || '@example.invalid'), (admin_uid, admin_uid || '@example.invalid');
  insert into public.admin_users(user_id, email, name) values (admin_uid, admin_uid || '@example.invalid', 'Sheet results probe admin');
  insert into public.parents(id, name, email) values (p, 'Sheet results probe', p || '@example.invalid');
  insert into public.children(id, parent_id, first_name, grade, province) values (c, p, 'Probe', 3, 'BC'), (c2, p, 'Sibling', 3, 'BC');
  insert into public.workbooks(id, parent_id, child_id, number, levels, printed_revision, generator, bank_snapshot_id, bank_snapshot_hash,
      engine_version, renderer_version, font_hashes, input_hash, input_path, pages_per_day)
    values (w, p, c, 1, '{3}', rev, 'v2', 'probe-snapshot', repeat('a', 64), 'probe', 'probe', '{}', replace(w::text, '-', '') || replace(w::text, '-', ''), p || '/' || w || '/input.json', 2);
  insert into public.workbooks(id, parent_id, child_id, number, levels, printed_revision) values (w2, p, c2, 1, '{3}', rev), (w_dup, p, c, 2, '{3}', rev);
  insert into public.workbook_sheets(workbook_id, parent_id, child_id, sheet_id, attempt, day, front_page_number, back_page_number, snapshot_id, starts_day, queue_reason)
    values (w, p, c, 'probe-sheet', 1, 1, 1, 2, 'probe-snapshot', true, 'new'), (w2, p, c2, 'probe-sheet', 1, 1, 1, 2, 'probe-snapshot', true, 'new');

  -- Duplicate (child_id, sheet_id, attempt) across two workbooks is blocked at issuance.
  begin
    insert into public.workbook_sheets(workbook_id, parent_id, child_id, sheet_id, attempt, day, front_page_number, back_page_number, snapshot_id, starts_day, queue_reason)
      values (w_dup, p, c, 'probe-sheet', 1, 1, 1, 2, 'probe-snapshot', true, 'new');
    raise exception 'duplicate_child_sheet_attempt_admitted';
  exception when unique_violation then null;
  end;

  -- The writer, as the service role: a newer marks version replaces, an older one is skipped and changes nothing.
  execute 'set local role service_role';
  r := public.publish_v2_workbook('{}'::jsonb);
  if r is distinct from '{"status":"refused","reason":"the book payload is incomplete"}'::jsonb then raise exception 'publish_payload_validation_regressed %', r; end if;
  r := public.write_child_sheet_results(c, 5, row_of);
  if r->>'status' is distinct from 'written' or (r->>'written')::int is distinct from 1 then raise exception 'first_write %', r; end if;
  r := public.write_child_sheet_results(c, 4, jsonb_set(row_of, '{0,result}', '"mastered"'));
  if r->>'status' is distinct from 'written' or (r->>'stale')::int is distinct from 1 or (r->>'marksVersion')::bigint is distinct from 5 then raise exception 'stale_write_not_skipped %', r; end if;
  if (select result from public.child_sheet_results where child_id = c) is distinct from 'unknown' then raise exception 'stale_write_clobbered'; end if;
  r := public.write_child_sheet_results(c, 6, jsonb_set(jsonb_set(row_of, '{0,result}', '"repeat"'), '{0,mistakes}', '2'));
  if r->>'status' is distinct from 'written' or (r->>'written')::int is distinct from 1 or (select (result, marks_version, mistakes) from public.child_sheet_results where child_id = c) is distinct from ('repeat'::text, 6::bigint, 2) then raise exception 'newer_write_lost %', r; end if;
  begin
    update public.child_sheet_results set marks_version = 3, result = 'mastered' where child_id = c;
    raise exception 'direct_stale_update_admitted';
  exception when sqlstate 'PT409' then null;
  end;
  r := public.write_child_sheet_results(c, 7, jsonb_set(row_of, '{0,sheetId}', '"never-issued"'));
  if r->>'status' is distinct from 'refused' then raise exception 'unissued_sheet_admitted %', r; end if;
  r := public.write_child_sheet_results(c, 7, jsonb_set(row_of, '{0,printedRevision}', to_jsonb(repeat('f', 28))));
  if r->>'status' is distinct from 'refused' then raise exception 'wrong_revision_admitted %', r; end if;
  r := public.write_child_sheet_results(c, 7, jsonb_set(row_of, '{0,workbookId}', to_jsonb(w_dup::text)));
  if r->>'status' is distinct from 'refused' then raise exception 'workbook_swap_admitted %', r; end if;
  r := public.mark_sheet_results_revision(c, 6);
  if r->>'status' is distinct from 'recorded' or (r->>'sheetResultsRevision')::bigint is distinct from 6 then raise exception 'mark_rev_failed %', r; end if;
  r := public.mark_sheet_results_revision(c, 3);
  if r->>'status' is distinct from 'recorded' or (r->>'sheetResultsRevision')::bigint is distinct from 6 then raise exception 'mark_rev_regressed %', r; end if;
  r := public.write_child_sheet_results(c2, 1, jsonb_set(row_of, '{0,workbookId}', to_jsonb(w2::text)));
  if r->>'status' is distinct from 'written' or (r->>'written')::int is distinct from 1 then raise exception 'sibling_write %', r; end if;
  insert into public.child_bank_state(child_id, parent_id, level_id, start_sheet_id) values (c, p, 'probe-level', 'probe-sheet'), (c2, p, 'probe-level', null);
  execute 'reset role';
  checks := array_append(checks, 'publish payload validation, monotonic marks_version, workbook/revision locks'::text);

  -- The expired photo still gets recovery while only the sheet result revision is behind.
  insert into public.scan_photos(id, parent_id, child_id, state, reserved_bytes, sent_at)
    values (photo, p, c, 'expired', 0, future_sent);
  update public.scan_marking_revisions set revision = 7, profile_revision = 7 where child_id = c;
  perform set_config('lock_timeout', '2s', true);
  update public.scan_marking_queue_cursor set after_sent_at = future_sent - interval '1 second', after_id = photo where singleton;
  execute 'set local role service_role';
  r := public.recover_scan_marking_oldest(1);
  if r is distinct from jsonb_build_array(jsonb_build_object('photo', photo, 'parent', p, 'child', c)) then raise exception 'sheet_results_recovery_missing %', r; end if;
  perform public.mark_sheet_results_revision(c, 7);
  execute 'reset role';
  update public.scan_marking_queue_cursor set after_sent_at = future_sent - interval '1 second', after_id = photo where singleton;
  execute 'set local role service_role';
  r := public.recover_scan_marking_oldest(1);
  if r is distinct from '[]'::jsonb then raise exception 'completed_sheet_results_still_pending %', r; end if;
  execute 'reset role';
  checks := array_append(checks, 'independent revision recovery'::text);

  -- Positive admin read check: synthetic admin reads both tables through RLS.
  perform set_config('request.jwt.claim.sub', admin_uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if not public.is_admin() then raise exception 'probe_admin_not_admin'; end if;
  select count(*) into n from public.child_sheet_results where parent_id = p;
  if n <> 2 then raise exception 'admin_reads_results_failed %', n; end if;
  select count(*) into n from public.child_bank_state where parent_id = p;
  if n <> 2 then raise exception 'admin_reads_state_failed %', n; end if;
  execute 'reset role';
  checks := array_append(checks, 'admin rls read'::text);

  -- Readers: a parent of the family (not an admin) reads no row and writes none; anon reads nothing.
  perform set_config('request.jwt.claim.sub', p::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.is_admin() then raise exception 'probe_parent_is_admin'; end if;
  select count(*) into n from public.child_sheet_results;
  if n <> 0 then raise exception 'non_admin_reads_results'; end if;
  select count(*) into n from public.child_bank_state;
  if n <> 0 then raise exception 'non_admin_reads_state'; end if;
  begin insert into public.child_bank_state(child_id, parent_id, level_id) values (c, p, 'other-level'); raise exception 'non_admin_state_write';
  exception when insufficient_privilege then null; end;
  begin update public.child_sheet_results set result = 'mastered'; raise exception 'non_admin_result_write';
  exception when insufficient_privilege then null; end;
  begin perform public.write_child_sheet_results(c, 99, row_of); raise exception 'non_admin_writer';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  execute 'set local role anon';
  begin perform 1 from public.child_sheet_results; raise exception 'anon_reads_results';
  exception when insufficient_privilege then null; end;
  begin perform public.write_child_sheet_results(c, 99, row_of); raise exception 'anon_writer';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  checks := array_append(checks, 'rls readers'::text);

  -- Fences: a child deletion, then a family deletion, refuse every write to both tables.
  insert into public.child_deletions(child_id, parent_id) values (c, p);
  execute 'set local role service_role';
  begin perform public.write_child_sheet_results(c, 8, row_of); raise exception 'child_fence_writer';
  exception when sqlstate '55000' then if sqlerrm <> 'child_unavailable' then raise; end if; end;
  begin update public.child_bank_state set pages_request = 'more' where child_id = c; raise exception 'child_fence_state';
  exception when sqlstate '55000' then if sqlerrm <> 'child_unavailable' then raise; end if; end;
  execute 'reset role';
  delete from public.child_deletions where child_id = c;
  update public.parents set deletion_requested_at = now() where id = p;
  execute 'set local role service_role';
  begin perform public.write_child_sheet_results(c2, 9, jsonb_set(row_of, '{0,workbookId}', to_jsonb(w2::text))); raise exception 'family_fence_writer';
  exception when sqlstate '55000' then if sqlerrm <> 'family_unavailable' then raise; end if; end;
  begin insert into public.child_bank_state(child_id, parent_id, level_id) values (c2, p, 'other-level'); raise exception 'family_fence_state';
  exception when sqlstate '55000' then if sqlerrm <> 'family_unavailable' then raise; end if; end;
  begin update public.child_sheet_results set items_scored = 11 where child_id = c; raise exception 'family_fence_result';
  exception when sqlstate '55000' then if sqlerrm <> 'family_unavailable' then raise; end if; end;
  execute 'reset role';
  update public.parents set deletion_requested_at = null where id = p;
  checks := array_append(checks, 'family and child fences'::text);

  -- Deletion: a child deletion removes only that child's rows; deleting the family removes every row.
  delete from public.children where id = c2;
  if exists (select 1 from public.child_sheet_results where child_id = c2) or exists (select 1 from public.child_bank_state where child_id = c2) then raise exception 'child_rows_survived'; end if;
  if not exists (select 1 from public.child_sheet_results where child_id = c) or not exists (select 1 from public.child_bank_state where child_id = c) then raise exception 'sibling_rows_lost'; end if;
  delete from auth.users where id = p;
  select (select count(*) from public.child_sheet_results where parent_id = p) + (select count(*) from public.child_bank_state where parent_id = p) into n;
  if n <> 0 then raise exception 'family_rows_survived %', n; end if;
  checks := array_append(checks, 'cascades (0 rows left)'::text);
  perform set_config('probe.checks', array_to_string(checks, ', '), true);
end $$;
select 'passed' as status, current_setting('probe.checks') as checks,
  (select count(*) from public.child_sheet_results) as result_rows_in_txn, (select count(*) from public.child_bank_state) as state_rows_in_txn;
rollback;
