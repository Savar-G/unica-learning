-- #476 review: the test check at admission locks the test mark's row itself, and the parent-lock trigger goes.
--
-- 20261109192936_next_book_admit_test_only.sql added a BEFORE DELETE trigger on public.test_accounts that locked the
-- parent row. A direct DELETE holds the test_accounts tuple before its row trigger asks for the parent, while
-- admin_set_test_account (and a parent deletion cascading into test_accounts) holds the parent before it deletes the
-- tuple: the two orders could deadlock (40P01).
--
-- Now there is no new lock order:
-- 1. The trigger next_book_test_mark_lock and its function are dropped.
-- 2. admit_next_book_run (same 6-argument signature, default and grants) locks the family's test_accounts row FOR SHARE
--    in its test check, after the parent lock it already takes. A delete of that row, by any path, waits for the
--    admission to commit. A delete that committed first, or one in progress that commits while the admission waits,
--    leaves no row (READ COMMITTED), so the admission refuses with 'test-families-only'. The admission takes the parent
--    and then the test row, as admin_set_test_account does; a direct DELETE takes the test row and then, in
--    test_account_family_lock, the chat list row and the 'maya_weekly' advisory lock, which the admission never takes.
--
-- The rest of the function body is the same as in 20261109192936. create or replace: the function is never missing.

drop trigger next_book_test_mark_lock on public.test_accounts;
drop function public.next_book_test_mark_lock();

create or replace function public.admit_next_book_run(p_snapshot uuid, p_by uuid, p_email text, p_max_attempts integer, p_stale_seconds integer,
  p_test_only boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.next_book_snapshots; answer jsonb; rid uuid; problem text; made integer;
begin
  select * into s from public.next_book_snapshots where id = p_snapshot;
  if not found then return jsonb_build_object('status','refused','reason','snapshot-not-found'); end if;
  perform public.assert_family_writable(s.parent_id);
  perform 1 from public.children where id = s.child_id for no key update;
  perform 1 from public.workbook_drafts where child_id = s.child_id and number > s.number order by id for no key update;
  select * into s from public.next_book_snapshots where id = p_snapshot for update;
  if s.run_id is not null then return jsonb_build_object('status','started','run',s.run_id,'existing',true); end if;
  -- The test mark's own row, locked FOR SHARE: a delete of it (any path) waits for this admission to commit; a delete
  -- that committed first, or one in progress that commits while this waits, leaves no row, so the admission refuses.
  if p_test_only is not false then
    perform 1 from public.test_accounts where parent_id = s.parent_id for share;
    if not found then return jsonb_build_object('status','refused','reason','test-families-only'); end if;
  end if;
  if s.held_reason is not null then return jsonb_build_object('status','refused','reason','held'); end if;
  if s.revision <> 1 then return jsonb_build_object('status','refused','reason','refresh-does-not-start-run'); end if;
  if s.plan_hash is null then return jsonb_build_object('status','refused','reason','not-planned'); end if;
  problem := public._next_book_source_problem(s.workbook_id, s.printed_revision);
  if problem is not null then return jsonb_build_object('status','refused','reason',problem); end if;
  if exists(select 1 from public.workbooks where child_id = s.child_id and number > s.number) then
    return jsonb_build_object('status','refused','reason','next-book-exists');
  end if;
  begin
    answer := public.start_workbook_run(s.child_id, p_by, p_email, p_max_attempts, p_stale_seconds);
    if answer->>'status' = 'started' then
      select number into made from public.workbook_runs where id = (answer->>'run')::uuid;
      if made is distinct from s.number + 1 then raise exception 'next_book_number' using errcode = 'NB001'; end if;
    end if;
  exception when sqlstate 'NB001' then
    -- Rolls back to the block start: the run and its run-started audit row are gone.
    return jsonb_build_object('status','refused','reason','next-book-exists');
  end;
  if answer->>'status' <> 'started' then return answer; end if;
  rid := (answer->>'run')::uuid;
  update public.workbook_runs set snapshot_id = s.id where id = rid;
  update public.next_book_snapshots set run_id = rid where id = s.id;
  insert into public.workbook_audit(parent_id, child_id, run_id, workbook_id, actor_id, actor_email, action, detail)
    values (s.parent_id, s.child_id, rid, s.workbook_id, p_by, p_email, 'snapshot-run-admitted',
      jsonb_build_object('snapshotId', s.id, 'planHash', s.plan_hash, 'reason', s.trigger_reason));
  return jsonb_build_object('status','started','run',rid,'existing',false);
end $$;

-- The same grants as before: the service role only.
revoke all on function public.admit_next_book_run(uuid, uuid, text, integer, integer, boolean) from public, anon, authenticated, service_role;
grant execute on function public.admit_next_book_run(uuid, uuid, text, integer, integer, boolean) to service_role;
