-- R428-7/R428-10: at most five total provider dispatches per page writer or question solver.
create table public.workbook_edit_calls (
  batch_id uuid not null references public.workbook_edits(id) on delete cascade,
  page_number int not null check (page_number > 0),
  question_id text not null,
  kind text not null check (kind in ('write','solve')),
  attempt int not null check (attempt between 1 and 5),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  lease uuid not null,
  dispatched_at timestamptz not null default now(),
  result jsonb,
  completed_at timestamptz,
  primary key (batch_id,page_number,question_id,kind,attempt),
  check ((result is null) = (completed_at is null))
);
alter table public.workbook_edit_calls enable row level security;
revoke all on public.workbook_edit_calls from anon,authenticated;
grant select on public.workbook_edit_calls to authenticated;
grant all on public.workbook_edit_calls to service_role;
create policy "Admins read edit calls" on public.workbook_edit_calls for select to authenticated using ((select public.is_admin()));

-- Serialize reservations on the batch, including an expired holder's uncertain requests.
create function public.reserve_workbook_edit_call(p_id uuid,p_lease uuid,p_page int,p_question text,p_kind text,p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.workbook_edits%rowtype; c public.workbook_edit_calls%rowtype; n int;
begin
  select * into e from public.workbook_edits where id=p_id for update;
  if not found or e.status<>'running' or e.lease is distinct from p_lease or e.heartbeat_at<=now()-interval '6 minutes' then
    return jsonb_build_object('status','stopped');
  end if;
  select * into c from public.workbook_edit_calls where batch_id=p_id and page_number=p_page and question_id=p_question and kind=p_kind and request_hash=p_hash and result is not null order by attempt limit 1;
  if found then return jsonb_build_object('status','saved','result',c.result); end if;
  select coalesce(max(attempt),0) into n from public.workbook_edit_calls where batch_id=p_id and page_number=p_page and question_id=p_question and kind=p_kind;
  if n>=5 then return jsonb_build_object('status','limit'); end if;
  insert into public.workbook_edit_calls(batch_id,page_number,question_id,kind,attempt,request_hash,lease)
    values(p_id,p_page,p_question,p_kind,n+1,p_hash,p_lease);
  return jsonb_build_object('status','dispatch','attempt',n+1);
end $$;
create function public.complete_workbook_edit_call(p_id uuid,p_lease uuid,p_page int,p_question text,p_kind text,p_hash text,p_attempt int,p_result jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.workbook_edits where id=p_id and status='running' and lease=p_lease and heartbeat_at>now()-interval '6 minutes' for update;
  if not found then return false; end if;
  update public.workbook_edit_calls set result=coalesce(result,p_result),completed_at=coalesce(completed_at,now())
    where batch_id=p_id and page_number=p_page and question_id=p_question and kind=p_kind and request_hash=p_hash and attempt=p_attempt and lease=p_lease;
  return found;
end $$;
revoke all on function public.reserve_workbook_edit_call(uuid,uuid,int,text,text,text) from public,anon,authenticated;
revoke all on function public.complete_workbook_edit_call(uuid,uuid,int,text,text,text,int,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_workbook_edit_call(uuid,uuid,int,text,text,text) to service_role;
grant execute on function public.complete_workbook_edit_call(uuid,uuid,int,text,text,text,int,jsonb) to service_role;

-- The existing family -> draft -> edit cascade also removes the call ledger.
-- Return comments on pages that exhausted their budget to pending, including partially successful batches.
create function public.workbook_edit_call_pending() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='failed' and new.batch_id is not null and exists (
    select 1 from public.workbook_edits e where e.id=new.batch_id and e.checkpoints->new.page_number::text->>'pending'='true'
  ) then new.status:='pending'; end if;
  return new;
end $$;
revoke all on function public.workbook_edit_call_pending() from public,anon,authenticated;
create trigger workbook_edit_call_pending before update on public.workbook_comments for each row execute function public.workbook_edit_call_pending();
