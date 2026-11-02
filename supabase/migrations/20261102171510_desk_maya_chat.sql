-- #358. Compatible with existing admin calls. Chat never consumes voice minutes.
alter table public.maya_calls drop constraint maya_calls_kind_check;
alter table public.maya_calls add constraint maya_calls_kind_check check (kind in ('admin_test', 'chat'));
alter table public.maya_calls add column channel text generated always as (case when kind = 'chat' then 'chat' else mode end) stored;
alter table public.maya_calls add constraint maya_chat_workbook check (kind <> 'chat' or (mode = 'text' and question_source = 'workbook' and not counts_minutes));

create table public.maya_chat_messages (
  id uuid primary key,
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null,
  call_id uuid not null references public.maya_calls(id) on delete cascade,
  received_at timestamptz not null default clock_timestamp(),
  input_revision integer not null check (input_revision >= 0),
  claim_revision integer not null,
  fingerprint text not null check (length(fingerprint) = 64),
  lease_until timestamptz not null,
  foreign key (child_id, parent_id) references public.children(id, parent_id) on delete cascade,
  unique (call_id, input_revision)
);
create index maya_chat_messages_day on public.maya_chat_messages(child_id, received_at);
alter table public.maya_chat_messages enable row level security;
revoke all on public.maya_chat_messages from anon, authenticated;
grant select on public.maya_chat_messages to authenticated;
grant select, insert, update, delete on public.maya_chat_messages to service_role;
create policy "Family reads chat usage" on public.maya_chat_messages for select to authenticated using (parent_id = (select auth.uid()));
create policy "Admins read chat usage" on public.maya_chat_messages for select to authenticated using ((select public.is_admin()));
create trigger fence_family_write before insert or update on public.maya_chat_messages for each row execute function public.fence_family_write();

-- Only the server can claim. It computes the dated family window with family-time.ts.
-- Lock the child across all sessions and tabs. Claim the call revision before model work.
-- A retried lease replaces the revision so a late old writer cannot commit.
create function public.claim_maya_chat_message(p_id uuid, p_parent uuid, p_child uuid, p_call uuid, p_revision integer, p_fingerprint text, p_start timestamptz, p_end timestamptz)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare c public.maya_calls; m public.maya_chat_messages; n integer; t timestamptz := clock_timestamp();
begin
  perform 1 from public.children where id=p_child and parent_id=p_parent for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  select * into c from public.maya_calls where id=p_call and child_id=p_child and parent_id=p_parent and kind='chat' for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  select * into m from public.maya_chat_messages where id=p_id;
  if found then
    if (m.call_id,m.input_revision,m.fingerprint) is distinct from (p_call,p_revision,p_fingerprint) then return jsonb_build_object('status','conflict'); end if;
    if c.revision > m.claim_revision then return jsonb_build_object('status','done'); end if;
    if m.lease_until > t then return jsonb_build_object('status','busy'); end if;
    update public.maya_calls set revision=revision+1 where id=c.id returning revision into c.revision;
    update public.maya_chat_messages set claim_revision=c.revision,lease_until=t+interval '2 minutes' where id=m.id;
    return jsonb_build_object('status','accepted','revision',c.revision);
  end if;
  if c.revision <> p_revision or c.status <> 'live' then return jsonb_build_object('status','conflict'); end if;
  if exists (select 1 from public.maya_chat_messages x join public.maya_calls y on y.id=x.call_id where x.child_id=p_child and y.revision=x.claim_revision and y.status='live') then
    return jsonb_build_object('status','busy');
  end if;
  if not (p_start <= t and t < p_end) or p_end-p_start not between interval '22 hours' and interval '26 hours' then return jsonb_build_object('status','window'); end if;
  select count(*) into n from public.maya_chat_messages where child_id=p_child and received_at>=p_start and received_at<p_end;
  if n >= 60 then return jsonb_build_object('status','cap'); end if;
  update public.maya_calls set revision=revision+1 where id=c.id returning revision into c.revision;
  insert into public.maya_chat_messages(id,parent_id,child_id,call_id,input_revision,claim_revision,fingerprint,lease_until)
    values(p_id,p_parent,p_child,p_call,p_revision,c.revision,p_fingerprint,t+interval '2 minutes');
  return jsonb_build_object('status','accepted','revision',c.revision);
end $$;
revoke all on function public.claim_maya_chat_message(uuid,uuid,uuid,uuid,integer,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_maya_chat_message(uuid,uuid,uuid,uuid,integer,text,timestamptz,timestamptz) to service_role;

-- Same note validation, with chat added to the family kinds. Test families remain excluded.
create or replace function public.maya_call_note_family_call() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_call record;
begin
  select c.kind,c.status,c.parent_id,c.child_id into v_call from public.maya_calls c where c.id=new.call_id;
  if not found then raise exception 'maya_call_note_no_call' using errcode='55000'; end if;
  if v_call.kind not in ('family','chat') then raise exception 'maya_call_note_test_call' using errcode='55000'; end if;
  if (v_call.parent_id,v_call.child_id) is distinct from (new.parent_id,new.child_id) then raise exception 'maya_call_note_family_mismatch' using errcode='55000'; end if;
  if v_call.status <> 'ended' then raise exception 'maya_call_note_not_ended' using errcode='55000'; end if;
  if exists(select 1 from public.test_accounts t where t.parent_id=new.parent_id) then raise exception 'maya_call_note_test_family' using errcode='55000'; end if;
  return new;
end $$;
