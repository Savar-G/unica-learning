-- #621: hosted rollback probe. All written rows use dedicated synthetic QA ids and .invalid addresses.
-- Never select a real family as a fixture. No write survives this transaction.
begin;
insert into auth.users(id, email) values
  ('62100000-0000-4000-8000-000000000001', 'family-621-a@qa.invalid'),
  ('62100000-0000-4000-8000-000000000002', 'family-621-b@qa.invalid'),
  ('62100000-0000-4000-8000-000000000003', 'admin-621@qa.invalid');
insert into public.parents(id, name, email) values
  ('62100000-0000-4000-8000-000000000001', 'QA 621 A', 'family-621-a@qa.invalid'),
  ('62100000-0000-4000-8000-000000000002', 'QA 621 B', 'family-621-b@qa.invalid');
insert into public.admin_users(user_id, name, email) values
  ('62100000-0000-4000-8000-000000000003', 'QA 621 Admin', 'admin-621@qa.invalid');

do $$
declare p uuid := '62100000-0000-4000-8000-000000000001';
  q uuid := '62100000-0000-4000-8000-000000000002';
  a uuid := '62100000-0000-4000-8000-000000000003';
  missing uuid := '62100000-0000-4000-8000-000000000004';
  v_result text;
begin
  perform set_config('request.jwt.claim.sub', a::text, true);
  set local role authenticated;
  if not public.is_admin() then raise exception 'Synthetic admin not authorized'; end if;
  perform public.admin_set_test_account(p, true);
  perform public.admin_set_test_account(p, true);
  if (select marked_by from public.test_accounts where parent_id=p) <> a then raise exception 'Wrong mark actor'; end if;
  if public.admin_set_maya_chat_family(p, 'rehearsal', true) <> 'not_listed' then raise exception 'Missing list row accepted'; end if;
  if public.admin_set_maya_chat_family(p, 'listed', true) <> 'ok' then raise exception 'List add failed'; end if;
  perform public.admin_set_maya_chat_family(p, 'listed', true);
  if (select added_by from public.maya_chat_families where parent_id=p) <> a then raise exception 'Wrong list actor'; end if;
  perform public.admin_set_test_account(q, true);
  perform public.admin_set_maya_chat_family(q, 'listed', true);
  -- If the live rehearsal place is occupied, this synthetic family must be refused. Never change that live row.
  v_result := public.admin_set_maya_chat_family(p, 'rehearsal', true);
  if v_result not in ('ok','taken') then raise exception 'Rehearsal result %',v_result; end if;
  if public.admin_set_maya_chat_family(q, 'rehearsal', true) <> 'taken' then raise exception 'Second rehearsal accepted'; end if;
  perform public.admin_set_test_account(p, false);
  if exists(select 1 from public.maya_chat_families where parent_id=p and rehearsal) then raise exception 'Rehearsal survived test removal'; end if;
  if public.admin_set_maya_chat_family(p, 'rehearsal', true) <> 'not_test_family' then raise exception 'Non-test rehearsal accepted'; end if;
  perform public.admin_set_maya_chat_family(p, 'listed', false);
  if public.admin_set_maya_chat_family(p, 'rehearsal', true) <> 'not_test_family' then raise exception 'Refusal order changed'; end if;
  if public.admin_set_maya_chat_family(p, 'rehearsal', false) <> 'not_listed' then raise exception 'Unlisted result changed'; end if;
  perform public.admin_set_test_account(p, true);
  perform public.admin_set_maya_chat_family(p, 'listed', true);

  -- Missing-family behavior stays the same as the old writes.
  perform public.admin_set_test_account(missing, false);
  if public.admin_set_maya_chat_family(missing, 'listed', false) <> 'ok'
    or public.admin_set_maya_chat_family(missing, 'rehearsal', false) <> 'not_listed'
    or public.admin_set_maya_chat_family(missing, 'rehearsal', true) <> 'not_test_family' then raise exception 'Missing-family result changed'; end if;
  begin
    perform public.admin_set_test_account(missing, true);
    raise exception 'Missing test family inserted';
  exception when foreign_key_violation then null; end;
  begin
    perform public.admin_set_maya_chat_family(missing, 'listed', true);
    raise exception 'Missing chat family inserted';
  exception when sqlstate '55000' then
    if sqlerrm <> 'family_unavailable' then raise; end if;
  end;

  reset role;
  update public.parents set deletion_requested_at=now() where id=p;
  set local role authenticated;
  begin
    perform public.admin_set_test_account(p, true);
    raise exception 'Deleting test family accepted';
  exception when sqlstate '55000' then
    if sqlerrm <> 'family_unavailable' then raise; end if;
  end;
  begin
    perform public.admin_set_maya_chat_family(p, 'listed', true);
    raise exception 'Deleting chat family accepted';
  exception when sqlstate '55000' then
    if sqlerrm <> 'family_unavailable' then raise; end if;
  end;
  begin
    perform public.admin_set_maya_chat_family(p, 'rehearsal', false);
    raise exception 'Deleting rehearsal family accepted';
  exception when sqlstate '55000' then
    if sqlerrm <> 'family_unavailable' then raise; end if;
  end;

  -- Parent and anon must be refused at the database boundary, independent of HTTP checks.
  perform set_config('request.jwt.claim.sub', p::text, true);
  begin
    perform public.admin_set_test_account(q, false);
    raise exception 'Parent changed a test mark';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_set_maya_chat_family(q, 'listed', false);
    raise exception 'Parent changed chat';
  exception when insufficient_privilege then null; end;
  reset role;
  set local role anon;
  begin
    perform public.admin_set_test_account(q, false);
    raise exception 'Anon changed a test mark';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_set_maya_chat_family(q, 'listed', false);
    raise exception 'Anon changed chat';
  exception when insufficient_privilege then null; end;
  reset role;

  -- Auth deletion removes the test and chat rows even while a family is fenced.
  delete from auth.users where id=p;
  if exists(select 1 from public.test_accounts where parent_id=p)
    or exists(select 1 from public.maya_chat_families where parent_id=p) then raise exception 'Auth cascade left rows'; end if;
end $$;
select 'PASS: admin writes; actor ids; idempotence; rehearsal uniqueness; test requirement; removal cleanup; missing-family results; deletion fence; parent/anon refusal; Auth cascade' as probe;
rollback;
