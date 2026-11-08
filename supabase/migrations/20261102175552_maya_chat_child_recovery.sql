-- R451-1. Recover the oldest pending turn of the child, across every chat and family day.
-- Admission still waits for recovery. Request IDs and receipts are never replaced or deleted.
create or replace function public.claim_maya_chat_message(p_id uuid, p_parent uuid, p_child uuid, p_call uuid, p_revision integer, p_fingerprint text, p_start timestamptz, p_end timestamptz)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare c public.maya_calls; m public.maya_chat_messages; n integer; t timestamptz := clock_timestamp();
begin
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
revoke all on function public.claim_maya_chat_message(uuid,uuid,uuid,uuid,integer,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_maya_chat_message(uuid,uuid,uuid,uuid,integer,text,timestamptz,timestamptz) to service_role;


create or replace function public.recover_maya_chat_message(p_parent uuid,p_child uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare c public.maya_calls; m public.maya_chat_messages; t timestamptz := clock_timestamp();
begin
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
revoke all on function public.recover_maya_chat_message(uuid,uuid) from public,anon,authenticated;
grant execute on function public.recover_maya_chat_message(uuid,uuid) to service_role;
