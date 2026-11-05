-- Permit a new child before its row exists. Keep the parent lock and deletion check.
create or replace function public.fence_child_delete_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb; c uuid; p uuid;
begin
  for r in select to_jsonb(new) union all select to_jsonb(old) where tg_op='UPDATE' loop
    c := public.child_delete_row_child(tg_table_name, r);
    if c is null then continue; end if;
    if tg_table_name='children' then p := (r->>'parent_id')::uuid;
    else select parent_id into p from public.children where id=c; end if;
    if p is null then raise exception 'child_unavailable' using errcode='55000'; end if;
    perform public.assert_family_writable(p);
    if exists(select 1 from public.child_deletions where child_id=c) then
      raise exception 'child_unavailable' using errcode='55000';
    end if;
  end loop;
  return new;
end $$;
