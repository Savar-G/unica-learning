-- R408-11: serialize a connection append with every claim/update of its call.
-- The database supplies a monotonic receipt time; worker clock differences do not reorder segments.
-- New RPC only. Existing tables, policies and legacy writer signatures remain compatible.
create function public.append_maya_call_connection(p_call uuid, p_revision integer, p_kind text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare r record; v_received timestamptz; v_at timestamptz;
begin
  if p_kind is null or p_kind not in ('agent_joined', 'agent_left', 'child_joined', 'child_left') then
    raise exception 'unknown connection kind';
  end if;
  update public.maya_calls set revision = revision + 1, updated_at = clock_timestamp()
    where id = p_call and revision = p_revision and mode = 'voice'
    returning parent_id, child_id into r;
  if not found then return null; end if;
  v_received := clock_timestamp();
  select greatest(v_received, max(at)) into v_at from public.maya_call_connections where call_id = p_call;
  insert into public.maya_call_connections(call_id, parent_id, child_id, kind, at, recorded_at)
    values (p_call, r.parent_id, r.child_id, p_kind, v_at, v_received);
  return v_at;
end $$;
revoke all on function public.append_maya_call_connection(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.append_maya_call_connection(uuid, integer, text) to service_role;
