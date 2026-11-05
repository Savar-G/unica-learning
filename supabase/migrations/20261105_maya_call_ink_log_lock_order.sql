-- #639, from the review of #635. Two fixes to the chat's ink log (migration maya_call_ink_log).
--
-- 1. One lock order for a chat: the parent row (for share), the child row, then the call row, the order a family's
--    deletion takes them. append_maya_call_ink locked the call, then its insert needed the child's foreign-key lock;
--    message admission locked the child, then the call. Two sessions deadlocked (40P01). claim_maya_chat_message and
--    recover_maya_chat_message took the parent row last (through the fence on their writes), so they take it first now.
-- 2. A chat from before the log: maya_calls.child_ink holds its whole-board copy and it has no event rows. Before the
--    first new event is taken, that copy becomes the first events, in order, in the same transaction, each of Maya's
--    batches as a delivery by id only, as inkLog in src/lib/board-history.ts does.
--
-- Additive: the same functions with new bodies. No table changes.
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
  perform 1 from public.parents where id = p_parent for share;
  perform 1 from public.children where id = p_child and parent_id = p_parent for key share;
  select status, ended_at, child_ink_at, child_ink into v_call
    from public.maya_calls
   where id = p_id and parent_id = p_parent and child_id = p_child and kind = 'chat' and mode = 'text'
     for update;
  if not found then return jsonb_build_object('status', 'not_found', 'held', 0); end if;
  select coalesce(max(seq), 0) into v_held from public.maya_call_ink_events where call_id = p_id;
  if v_call.status = 'ended' and v_call.ended_at < v_now - make_interval(secs => p_after_end_ms / 1000.0) then
    return jsonb_build_object('status', 'closed', 'held', v_held);
  end if;
  if v_held = 0 and jsonb_typeof(v_call.child_ink->'events') = 'array' then
    insert into public.maya_call_ink_events (call_id, seq, parent_id, child_id, event)
    select p_id, e.n::integer, p_parent, p_child,
           case when e.value->>'kind' in ('maya', 'skipped')
                then jsonb_build_object('kind', 'delivered', 't', e.value->'t', 'batchId', e.value->'batchId')
                else e.value end
      from jsonb_array_elements(v_call.child_ink->'events') with ordinality as e(value, n);
    select coalesce(max(seq), 0) into v_held from public.maya_call_ink_events where call_id = p_id;
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

create or replace function public.claim_maya_chat_message(p_id uuid, p_parent uuid, p_child uuid, p_call uuid, p_revision integer, p_fingerprint text, p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
as $$
declare c public.maya_calls; m public.maya_chat_messages; n integer; t timestamptz := clock_timestamp();
begin
  perform 1 from public.parents where id=p_parent for share;
  perform 1 from public.children where id=p_child and parent_id=p_parent for update;
  if not found then return jsonb_build_object('status','not_found','admitted',false); end if;
  select * into c from public.maya_calls where id=p_call and child_id=p_child and parent_id=p_parent and kind='chat' for update;
  if not found then return jsonb_build_object('status','not_found','admitted',false); end if;
  select * into m from public.maya_chat_messages where id=p_id;
  if found then
    if (m.call_id,m.input_revision,m.fingerprint) is distinct from (p_call,p_revision,p_fingerprint) then return jsonb_build_object('status','conflict','admitted',false); end if;
    if c.revision > m.claim_revision then return jsonb_build_object('status','done','admitted',true); end if;
    if m.lease_until > t then return jsonb_build_object('status','busy','admitted',true); end if;
    update public.maya_calls set revision=revision+1 where id=c.id returning revision into c.revision;
    update public.maya_chat_messages set claim_revision=c.revision,lease_until=t+interval '2 minutes' where id=m.id;
    return jsonb_build_object('status','accepted','revision',c.revision,'admitted',true);
  end if;
  if c.revision <> p_revision or c.status <> 'live' then return jsonb_build_object('status','conflict','admitted',false); end if;
  select x.* into m from public.maya_chat_messages x join public.maya_calls y on y.id=x.call_id
    where x.child_id=p_child and x.parent_id=p_parent and y.kind='chat' and y.revision=x.claim_revision and y.status='live'
    order by x.received_at,x.id limit 1;
  if found then
    return jsonb_build_object('status',case when m.lease_until <= t then 'recover' else 'busy' end,'admitted',false);
  end if;
  if not (p_start <= t and t < p_end) or p_end-p_start not between interval '22 hours' and interval '26 hours' then return jsonb_build_object('status','window','admitted',false); end if;
  select count(*) into n from public.maya_chat_messages where child_id=p_child and received_at>=p_start and received_at<p_end;
  if n >= 60 then return jsonb_build_object('status','cap','admitted',false); end if;
  update public.maya_calls set revision=revision+1 where id=c.id returning revision into c.revision;
  insert into public.maya_chat_messages(id,parent_id,child_id,call_id,input_revision,claim_revision,fingerprint,lease_until)
    values(p_id,p_parent,p_child,p_call,p_revision,c.revision,p_fingerprint,t+interval '2 minutes');
  return jsonb_build_object('status','accepted','revision',c.revision,'admitted',true);
end $$;

create or replace function public.recover_maya_chat_message(p_parent uuid, p_child uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
as $$
declare c public.maya_calls; m public.maya_chat_messages; t timestamptz := clock_timestamp();
begin
  perform 1 from public.parents where id=p_parent for share;
  perform 1 from public.children where id=p_child and parent_id=p_parent for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  select x.* into m from public.maya_chat_messages x join public.maya_calls y on y.id=x.call_id
    where x.parent_id=p_parent and x.child_id=p_child and y.parent_id=p_parent and y.child_id=p_child
      and y.kind='chat' and y.status='live' and y.revision=x.claim_revision
    order by x.received_at,x.id limit 1;
  if not found then return jsonb_build_object('status','none'); end if;
  if m.lease_until > t then return jsonb_build_object('status','busy'); end if;
  if m.body is null then return jsonb_build_object('status','missing_body'); end if;
  select * into c from public.maya_calls where id=m.call_id for update;
  -- A call may have committed while this transaction waited for its row.
  if c.status <> 'live' or c.revision <> m.claim_revision then return jsonb_build_object('status','none'); end if;
  update public.maya_calls set revision=revision+1 where id=c.id returning revision into c.revision;
  update public.maya_chat_messages set claim_revision=c.revision,lease_until=t+interval '2 minutes' where id=m.id;
  return jsonb_build_object('status','accepted','id',m.id,'callId',c.id,'revision',c.revision,
    'inputRevision',m.input_revision,'text',m.body);
end $$;

