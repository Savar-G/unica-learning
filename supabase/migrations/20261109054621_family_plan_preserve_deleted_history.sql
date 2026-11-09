-- Capture PR B pricing facts before a child cascade removes legacy starts and provider state.
-- The public child-deletion functions keep their original results and deletion checks.
create function public.preserve_family_plan_history_before_child_delete() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- A family cascade must remove this history too. Do not recreate it for a missing or deleting parent.
  if exists(select 1 from public.parents where id=old.parent_id and deletion_requested_at is null) then
    perform public.seed_family_plan_history(old.parent_id);
  end if;
  return old;
end $$;
revoke all on function public.preserve_family_plan_history_before_child_delete() from public,anon,authenticated,service_role;
create trigger preserve_family_plan_history_before_child_delete before delete on public.children
  for each row execute function public.preserve_family_plan_history_before_child_delete();
