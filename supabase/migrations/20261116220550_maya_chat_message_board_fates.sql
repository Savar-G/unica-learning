-- #1084: admission owns one immutable child text and validated board report.
-- Additive: keep the old nine-argument admission function for already deployed code.
create function public.maya_chat_fates_valid(p_fates jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare f jsonb; seen text[] := '{}';
begin
  if p_fates is null or jsonb_typeof(p_fates) <> 'array' then return false; end if;
  if jsonb_array_length(p_fates) > 32 then return false; end if;
  for f in select value from jsonb_array_elements(p_fates) loop
    if jsonb_typeof(f) <> 'object' or jsonb_typeof(f->'batchId') is distinct from 'string'
      or length(f->>'batchId') not between 1 and 64
      or jsonb_typeof(f->'fate') is distinct from 'string'
      or f->>'fate' not in ('shown','skipped','cancelled')
      or f - 'batchId' - 'fate' <> '{}'::jsonb
      or f->>'batchId' = any(seen) then return false; end if;
    seen := array_append(seen,f->>'batchId');
  end loop;
  return true;
end $$;
revoke all on function public.maya_chat_fates_valid(jsonb) from public,anon,authenticated;
grant execute on function public.maya_chat_fates_valid(jsonb) to service_role;

alter table public.maya_chat_messages add column board_fates jsonb
  constraint maya_chat_messages_board_fates_check
  check (board_fates is null or public.maya_chat_fates_valid(board_fates));

create function public.take_maya_chat_message(p_id uuid,p_parent uuid,p_child uuid,p_call uuid,p_revision integer,p_fingerprint text,p_start timestamptz,p_end timestamptz,p_text text,p_fates jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r jsonb; m public.maya_chat_messages;
begin
  if p_text is null or length(p_text) > 500 or length(btrim(p_text)) < 1
    or not public.maya_chat_fates_valid(p_fates) then return jsonb_build_object('status','invalid'); end if;
  r:=public.claim_maya_chat_message(p_id,p_parent,p_child,p_call,p_revision,p_fingerprint,p_start,p_end);
  if r->>'status'='accepted' then
    -- claim holds the parent, child and call locks. A retry keeps the first payload.
    update public.maya_chat_messages set body=p_text,board_fates=p_fates where id=p_id and body is null;
    select * into m from public.maya_chat_messages where id=p_id;
    if m.board_fates is not null and not public.maya_chat_fates_valid(m.board_fates) then
      raise exception 'Chat payload cannot be read';
    end if;
    r:=r || jsonb_build_object('text',m.body,'fates',coalesce(m.board_fates,'[]'::jsonb));
  end if;
  return r;
end $$;
revoke all on function public.take_maya_chat_message(uuid,uuid,uuid,uuid,integer,text,timestamptz,timestamptz,text,jsonb) from public,anon,authenticated;
grant execute on function public.take_maya_chat_message(uuid,uuid,uuid,uuid,integer,text,timestamptz,timestamptz,text,jsonb) to service_role;

create or replace function public.take_maya_chat_message(p_id uuid,p_parent uuid,p_child uuid,p_call uuid,p_revision integer,p_fingerprint text,p_start timestamptz,p_end timestamptz,p_text text)
returns jsonb language sql security invoker set search_path = '' as $$
  select public.take_maya_chat_message(p_id,p_parent,p_child,p_call,p_revision,p_fingerprint,p_start,p_end,p_text,'[]'::jsonb);
$$;

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
  if m.board_fates is not null and not public.maya_chat_fates_valid(m.board_fates) then
    return jsonb_build_object('status','invalid_payload');
  end if;
  select * into c from public.maya_calls where id=m.call_id for update;
  -- A call may have committed while this transaction waited for its row.
  if c.status <> 'live' or c.revision <> m.claim_revision then return jsonb_build_object('status','none'); end if;
  update public.maya_calls set revision=revision+1 where id=c.id returning revision into c.revision;
  update public.maya_chat_messages set claim_revision=c.revision,lease_until=t+interval '2 minutes' where id=m.id;
  return jsonb_build_object('status','accepted','id',m.id,'callId',c.id,'revision',c.revision,
    'inputRevision',m.input_revision,'text',m.body,'fates',coalesce(m.board_fates,'[]'::jsonb));
end $$;

