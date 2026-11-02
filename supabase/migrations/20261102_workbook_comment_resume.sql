-- Checkpoint accepted pages before a server handoff or a worker restart.
alter table public.workbook_edits add column checkpoints jsonb not null default '{}'::jsonb;
create function public.checkpoint_workbook_edit(p_id uuid,p_lease uuid,p_page int,p_result jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  update public.workbook_edits set checkpoints=jsonb_set(checkpoints,array[p_page::text],p_result),heartbeat_at=now()
    where id=p_id and status='running' and lease=p_lease;
  return found;
end $$;
create function public.release_workbook_edit(p_id uuid,p_lease uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  update public.workbook_edits set status='queued',lease=null,heartbeat_at=now() where id=p_id and status='running' and lease=p_lease;
  return found;
end $$;
revoke all on function public.checkpoint_workbook_edit(uuid,uuid,int,jsonb) from public,anon,authenticated;
revoke all on function public.release_workbook_edit(uuid,uuid) from public,anon,authenticated;
grant execute on function public.checkpoint_workbook_edit(uuid,uuid,int,jsonb) to service_role;
grant execute on function public.release_workbook_edit(uuid,uuid) to service_role;
