-- The child's ink in a chat with Maya as an append-only event log (#635, follows #534): each change the child makes on
-- the chat's board (a stroke, an eraser stroke, an undo, a clear, a pen move) and each of Maya's batches as it reached the
-- child's board is one event with the desk's sequence number. The desk sends only the events the server does not hold
-- yet; the server appends them idempotently by (call, sequence) and answers with the last sequence it holds. There are no
-- revisions, no conflicts and no whole-board copies. The admin replay reads the log (src/lib/maya-call.ts).
--
-- public.maya_call_ink_events: one row per event (the server writes through append_maya_call_ink only; admins read; no
-- parent access; deleted with the call and the family). append_maya_call_ink(call, parent, child, from, events, gap ms,
-- after end ms) checks in one transaction, under the call's row lock: a chat ('chat', 'text') of this parent and child;
-- live, or ended less than `after end ms` ago ('closed'); no append in the last `gap ms` ('busy'); `from` no further than
-- one past the last held sequence ('gap'). Events at sequences already held are left as they are (idempotent). The
-- answer is { status, held }.
--
-- Additive: one new table, one new function. maya_calls.child_ink and save_maya_call_ink stay for the code that still
-- calls them (the #625 preview) until no deployed code does.
create table if not exists public.maya_call_ink_events (
  call_id uuid not null,
  seq integer not null check (seq between 1 and 20000),
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null,
  event jsonb not null check (jsonb_typeof(event) = 'object' and pg_column_size(event) < 200000),
  received_at timestamptz not null default now(),
  primary key (call_id, seq),
  constraint maya_call_ink_events_call_fkey foreign key (call_id, parent_id, child_id)
    references public.maya_calls (id, parent_id, child_id) on delete cascade,
  constraint maya_call_ink_events_child_fkey foreign key (child_id, parent_id)
    references public.children (id, parent_id) on delete cascade
);
create index if not exists maya_call_ink_events_parent_idx on public.maya_call_ink_events (parent_id);
create index if not exists maya_call_ink_events_child_idx on public.maya_call_ink_events (child_id, parent_id);

alter table public.maya_call_ink_events enable row level security;
revoke all on table public.maya_call_ink_events from anon, authenticated, service_role;
grant select on table public.maya_call_ink_events to service_role;
grant select on table public.maya_call_ink_events to authenticated;
create policy "Admins read Maya call ink" on public.maya_call_ink_events
  for select to authenticated using ((select public.is_admin()));

create trigger fence_family_write before insert or update on public.maya_call_ink_events
  for each row execute function public.fence_family_write();

create or replace function public.append_maya_call_ink(p_id uuid, p_parent uuid, p_child uuid, p_from integer, p_events jsonb, p_gap_ms integer, p_after_end_ms integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_call record;
  v_held integer;
  v_count integer;
begin
  if p_from is null or p_from < 1 or p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'append_maya_call_ink: events need a first sequence and a list';
  end if;
  v_count := jsonb_array_length(p_events);
  if v_count > 500 or p_from + v_count - 1 > 20000 then
    raise exception 'append_maya_call_ink: too many events';
  end if;
  select status, ended_at, child_ink_at into v_call
    from public.maya_calls
   where id = p_id and parent_id = p_parent and child_id = p_child and kind = 'chat' and mode = 'text'
     for update;
  if not found then return jsonb_build_object('status', 'not_found', 'held', 0); end if;
  select coalesce(max(seq), 0) into v_held from public.maya_call_ink_events where call_id = p_id;
  if v_call.status = 'ended' and v_call.ended_at < v_now - make_interval(secs => p_after_end_ms / 1000.0) then
    return jsonb_build_object('status', 'closed', 'held', v_held);
  end if;
  if v_call.child_ink_at > v_now - make_interval(secs => p_gap_ms / 1000.0) then
    return jsonb_build_object('status', 'busy', 'held', v_held);
  end if;
  if p_from > v_held + 1 then return jsonb_build_object('status', 'gap', 'held', v_held); end if;
  insert into public.maya_call_ink_events (call_id, seq, parent_id, child_id, event)
  select p_id, p_from + (e.n - 1)::integer, p_parent, p_child, e.value
    from jsonb_array_elements(p_events) with ordinality as e(value, n)
   where p_from + (e.n - 1) > v_held
  on conflict (call_id, seq) do nothing;
  update public.maya_calls set child_ink_at = v_now where id = p_id;
  select coalesce(max(seq), 0) into v_held from public.maya_call_ink_events where call_id = p_id;
  return jsonb_build_object('status', 'saved', 'held', v_held);
end;
$$;

revoke all on function public.append_maya_call_ink(uuid, uuid, uuid, integer, jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.append_maya_call_ink(uuid, uuid, uuid, integer, jsonb, integer, integer) to service_role;
