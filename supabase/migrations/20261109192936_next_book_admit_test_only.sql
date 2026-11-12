-- #476 review: admit a next-book run for a test family only, checked under the family lock at admission.
--
-- Until the workbook worker makes a snapshot run from its saved plan_input, the site prepares book 2 for test families
-- only (NEXT_BOOK_REAL_FAMILIES in src/lib/next-book-planner.ts). The site checked public.test_accounts before the
-- capture and the plan, so a test mark removed while the plan ran still got a run. Now:
--
-- 1. admit_next_book_run takes p_test_only (default false: the behaviour before this change). When true, after the
--    parent row lock it already takes (assert_family_writable, FOR SHARE), it refuses with 'test-families-only' unless
--    the parent is in public.test_accounts. Nothing is admitted. A chain that already has its run still answers with
--    that run.
-- 2. Every removal of a test mark takes the parent row lock first (FOR NO KEY UPDATE, which waits for FOR SHARE), in a
--    BEFORE DELETE trigger on public.test_accounts. It covers every delete path: admin_set_test_account (which already
--    holds the parent FOR UPDATE), a direct DELETE by an admin session (the table grant and policy still allow it), the
--    service role and SQL. So a removal either commits before the admission's lock, and the admission sees it, or waits
--    for the admission to commit. During a family deletion the parent row is already deleted by the same transaction,
--    so the lock finds no row and changes nothing. The trigger's name sorts before test_account_family_lock, so it fires
--    first.
--
-- Additive for the live code: the old 5-argument function is dropped and the 6-argument one created in the same
-- transaction. A call with the old 5 named arguments (the site before this change) resolves to the new function with
-- p_test_only = false. Keeping both would make that call ambiguous, so the old one cannot stay.

drop function public.admit_next_book_run(uuid, uuid, text, integer, integer);

create function public.admit_next_book_run(p_snapshot uuid, p_by uuid, p_email text, p_max_attempts integer, p_stale_seconds integer,
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
  -- Under the parent lock: a test mark removed before it is seen here, and one removed after it waits for this commit.
  if p_test_only is not false and not exists(select 1 from public.test_accounts where parent_id = s.parent_id) then
    return jsonb_build_object('status','refused','reason','test-families-only');
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

-- The same grants as the function it replaces (20261109050245_next_book_snapshots.sql): the service role only.
revoke all on function public.admit_next_book_run(uuid, uuid, text, integer, integer, boolean) from public, anon, authenticated, service_role;
grant execute on function public.admit_next_book_run(uuid, uuid, text, integer, integer, boolean) to service_role;

-- A removed test mark waits for an admission that holds the family lock, and the next admission sees it removed.
create function public.next_book_test_mark_lock() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.parents where id = old.parent_id for no key update;
  return old;
end $$;
revoke all on function public.next_book_test_mark_lock() from public, anon, authenticated;
create trigger next_book_test_mark_lock before delete on public.test_accounts
  for each row execute function public.next_book_test_mark_lock();
