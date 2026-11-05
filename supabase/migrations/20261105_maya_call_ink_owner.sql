-- The child's board in a chat (#534, review R625b-5): save_maya_call_ink also checks whose chat it is. The function now
-- takes the parent and the child the desk is open for, and writes only to a chat (kind 'chat', mode 'text') of that
-- parent and child; for any other call it answers 'not_found', as for no call at all.
--
-- Replaces the function of migration maya_call_ink_save in one step: no deployed code on main calls it (only the
-- preview of PR #625, which this change replaces). Everything else is as before: one conditional update compares the
-- ink revision and writes, without raising the call's revision; 'closed', 'busy' and 'stale' say why nothing was
-- written. Only the server calls it (secret key).
drop function if exists public.save_maya_call_ink(uuid, jsonb, integer, integer);

create or replace function public.save_maya_call_ink(p_id uuid, p_parent uuid, p_child uuid, p_ink jsonb, p_gap_ms integer, p_after_end_ms integer)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_saved uuid;
  v_call record;
begin
  if p_ink is null or jsonb_typeof(p_ink) <> 'object' or jsonb_typeof(p_ink->'revision') <> 'number' then
    raise exception 'save_maya_call_ink: the board needs a revision';
  end if;
  update public.maya_calls
     set child_ink = p_ink, child_ink_at = v_now
   where id = p_id
     and parent_id = p_parent
     and child_id = p_child
     and kind = 'chat'
     and mode = 'text'
     and not (status = 'ended' and ended_at < v_now - make_interval(secs => p_after_end_ms / 1000.0))
     and (child_ink_at is null or child_ink_at <= v_now - make_interval(secs => p_gap_ms / 1000.0))
     and (child_ink is null or (child_ink->>'revision')::bigint <= (p_ink->>'revision')::bigint)
  returning id into v_saved;
  if v_saved is not null then return 'saved'; end if;
  -- Nothing written: say why.
  select status, ended_at, child_ink_at into v_call
    from public.maya_calls
   where id = p_id and parent_id = p_parent and child_id = p_child and kind = 'chat' and mode = 'text';
  if not found then return 'not_found'; end if;
  if v_call.status = 'ended' and v_call.ended_at < v_now - make_interval(secs => p_after_end_ms / 1000.0) then return 'closed'; end if;
  if v_call.child_ink_at > v_now - make_interval(secs => p_gap_ms / 1000.0) then return 'busy'; end if;
  return 'stale';
end;
$$;

revoke all on function public.save_maya_call_ink(uuid, uuid, uuid, jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.save_maya_call_ink(uuid, uuid, uuid, jsonb, integer, integer) to service_role;
