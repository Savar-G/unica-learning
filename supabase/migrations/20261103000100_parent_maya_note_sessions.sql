-- #419: expose only the type and start time of a session that already has the caller's parent note.
-- Parents still cannot read maya_calls, its trace, proposals or live state.
create function public.parent_maya_note_sessions(p_calls uuid[])
returns table (call_id uuid, channel text, started_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.id, case when c.kind = 'chat' then 'chat' else 'call' end,
         coalesce(c.started_at, c.created_at)
  from public.maya_call_notes n
  join public.maya_calls c on c.id = n.call_id and c.parent_id = n.parent_id and c.child_id = n.child_id
  where n.parent_id = (select auth.uid())
    and c.id = any(p_calls) and cardinality(p_calls) <= 100
    and c.status = 'ended' and c.kind in ('chat', 'family');
$$;
revoke all on function public.parent_maya_note_sessions(uuid[]) from public, anon, authenticated;
grant execute on function public.parent_maya_note_sessions(uuid[]) to authenticated;
