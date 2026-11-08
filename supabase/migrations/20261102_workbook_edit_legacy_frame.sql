-- Refuse partial edit results made before batches stored their build and models.
create or replace function public.frame_workbook_edit(p_id uuid,p_lease uuid,p_frame jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_frame jsonb;
begin
  update public.workbook_edits set frame=coalesce(frame,
    case when checkpoints<>'{}'::jsonb then '{"build":"unframed-edit","model":null,"solveModel":"unknown"}'::jsonb else p_frame end)
    where id=p_id and status='running' and lease=p_lease and heartbeat_at > now()-interval '6 minutes'
    returning frame into v_frame;
  return v_frame;
end $$;
