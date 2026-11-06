-- #621: direct admin DELETE/UPDATE takes the test/chat tuple before its row trigger can lock the parent.
-- Auth deletion takes the parent first, then cascades to those tuples. The two paths can deadlock (40P01).
-- These admin-session entry points take the parent first. FOR UPDATE also serializes two admin changes to the same
-- family before either takes a test/chat tuple. Existing triggers retain the rehearsal rules and deletion fence.
-- Additive: old table privileges and trigger bodies stay compatible until the new application code is deployed.

create function public.admin_set_test_account(p_parent uuid, p_test boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_parent is null or p_test is null then
    raise exception 'admin_test_account_invalid' using errcode = '22023';
  end if;
  perform 1 from public.parents where id = p_parent for update;
  if p_test then
    if found then perform public.assert_family_writable(p_parent); end if;
    insert into public.test_accounts(parent_id, marked_by) values(p_parent, auth.uid())
      on conflict (parent_id) do nothing;
  else
    -- A missing family remains a successful no-op. A rehearsal ends through test_account_ends_rehearsal.
    delete from public.test_accounts where parent_id = p_parent;
  end if;
end $$;
revoke all on function public.admin_set_test_account(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.admin_set_test_account(uuid, boolean) to authenticated;

create function public.admin_set_maya_chat_family(p_parent uuid, p_change text, p_enabled boolean) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_parent is null or p_enabled is null or p_change is null or p_change not in ('listed', 'rehearsal') then
    raise exception 'admin_chat_family_invalid' using errcode = '22023';
  end if;
  perform 1 from public.parents where id = p_parent for update;
  if p_change = 'listed' then
    if p_enabled then
      insert into public.maya_chat_families(parent_id, added_by) values(p_parent, auth.uid())
        on conflict (parent_id) do nothing;
    else
      delete from public.maya_chat_families where parent_id = p_parent;
    end if;
    return 'ok';
  end if;
  -- Keep the existing refusal order, including for a missing family. Read only after the parent lock.
  if p_enabled and not exists(select 1 from public.test_accounts where parent_id = p_parent) then
    return 'not_test_family';
  end if;
  begin
    update public.maya_chat_families set rehearsal = p_enabled where parent_id = p_parent;
    if not found then return 'not_listed'; end if;
  exception when unique_violation then
    return 'taken';
  end;
  return 'ok';
end $$;
revoke all on function public.admin_set_maya_chat_family(uuid, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.admin_set_maya_chat_family(uuid, text, boolean) to authenticated;
