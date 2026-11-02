-- Keep an admitted child turn on the server so a reload can recover after a stopped request.
-- The family deletion cascades this text with its message row.
alter table public.maya_chat_messages add column body text check (body is null or length(body) between 1 and 500);
create function public.take_maya_chat_message(p_id uuid,p_parent uuid,p_child uuid,p_call uuid,p_revision integer,p_fingerprint text,p_start timestamptz,p_end timestamptz,p_text text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r jsonb;
begin
  if p_text is null or length(btrim(p_text)) not between 1 and 500 then return jsonb_build_object('status','invalid'); end if;
  r:=public.claim_maya_chat_message(p_id,p_parent,p_child,p_call,p_revision,p_fingerprint,p_start,p_end);
  if r->>'status'='accepted' then
    update public.maya_chat_messages set body=p_text where id=p_id;
  end if;
  return r;
end $$;
revoke all on function public.take_maya_chat_message(uuid,uuid,uuid,uuid,integer,text,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.take_maya_chat_message(uuid,uuid,uuid,uuid,integer,text,timestamptz,timestamptz,text) to service_role;
