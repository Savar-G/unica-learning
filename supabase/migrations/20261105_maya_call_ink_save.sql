-- One save of the child's board in a chat (#534, review R625-2 and R625-6): compare and write in one statement, so a
-- slow save from the board's earlier holder never replaces a newer board, whatever the order the two arrive in.
--
-- save_maya_call_ink(id, ink, gap ms, after end ms) writes `child_ink` and `child_ink_at` only when: the call is a text
-- call; it is live, or ended less than `after end ms` ago; no board was saved in the last `gap ms`; and the kept board
-- has no higher revision. It never raises the call's revision. The answer: 'saved', or why not ('closed', 'busy',
-- 'stale', 'not_found'). The code passes the limits (INK_SAVE_GAP_MS and INK_AFTER_END_MS in src/lib/maya-call.ts).
-- Only the server calls it (secret key).
--
-- Additive: one new nullable column and one new function. The code on main uses neither.
alter table public.maya_calls add column if not exists child_ink_at timestamptz;

create or replace function public.save_maya_call_ink(p_id uuid, p_ink jsonb, p_gap_ms integer, p_after_end_ms integer)
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
     and mode = 'text'
     and not (status = 'ended' and ended_at < v_now - make_interval(secs => p_after_end_ms / 1000.0))
     and (child_ink_at is null or child_ink_at <= v_now - make_interval(secs => p_gap_ms / 1000.0))
     and (child_ink is null or (child_ink->>'revision')::bigint <= (p_ink->>'revision')::bigint)
  returning id into v_saved;
  if v_saved is not null then return 'saved'; end if;
  -- Nothing written: say why.
  select status, ended_at, child_ink_at, (child_ink->>'revision')::bigint as revision into v_call
    from public.maya_calls where id = p_id and mode = 'text';
  if not found then return 'not_found'; end if;
  if v_call.status = 'ended' and v_call.ended_at < v_now - make_interval(secs => p_after_end_ms / 1000.0) then return 'closed'; end if;
  if v_call.child_ink_at > v_now - make_interval(secs => p_gap_ms / 1000.0) then return 'busy'; end if;
  return 'stale';
end;
$$;

revoke all on function public.save_maya_call_ink(uuid, jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.save_maya_call_ink(uuid, jsonb, integer, integer) to service_role;
