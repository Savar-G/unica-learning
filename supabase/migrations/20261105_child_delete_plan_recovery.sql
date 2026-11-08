-- #557 / #593 compatibility. Keep the child fence; let billing own its family-recovery exception.
-- Permit a new child before its row exists. Keep the parent lock and deletion check.
create or replace function public.fence_child_delete_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb; c uuid; p uuid;
begin
  -- The copy link is written by the lease-checked shared copy function while the child is frozen.
  if tg_table_name='anonymous_test_links' then return new; end if;
  for r in select to_jsonb(new) union all select to_jsonb(old) where tg_op='UPDATE' loop
    c := public.child_delete_row_child(tg_table_name, r);
    if c is null then continue; end if;
    if tg_table_name='children' then p := (r->>'parent_id')::uuid;
    else select parent_id into p from public.children where id=c; end if;
    if p is null then raise exception 'child_unavailable' using errcode='55000'; end if;
    if tg_table_name='plan_starts' then
      -- Billing's fence_plan_start_write owns the narrow queued-family recovery exception.
      -- Share the parent lock here only to serialize the child guard with a child deletion request.
      perform 1 from public.parents where id=p for share;
      if not found then raise exception 'family_unavailable' using errcode='55000'; end if;
    else
      perform public.assert_family_writable(p);
    end if;
    if exists(select 1 from public.child_deletions where child_id=c) then
      raise exception 'child_unavailable' using errcode='55000';
    end if;
  end loop;
  return new;
end $$;
