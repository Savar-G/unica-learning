-- #680. Additive. Five new messages per parent per rolling hour; 5,000 Unicode characters.
-- Only submit_feedback writes. No provider notification. Child-scoped rows cascade with that child.
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid,
  request_id uuid not null,
  product text not null check (product in ('workbook','parent_dashboard','marking','maya','other')),
  text text not null check (char_length(text) between 1 and 5000 and text !~ '^[[:space:]]*$'),
  source text not null check (source in ('/account','/account/feedback','/account/settings','/account/workbooks','/account/scan','/account/progress','/account/notes','/account/report','/account/plan','/account/pin','/account/password','/account/learning','/account/start','/account/finish','/account/maya-notice')),
  created_at timestamptz not null default clock_timestamp(),
  status text not null default 'new' check (status in ('new','read','closed')),
  foreign key(child_id,parent_id) references public.children(id,parent_id) on delete cascade,
  unique(parent_id,request_id)
);
create index feedback_parent_time_idx on public.feedback(parent_id,created_at desc);
create index feedback_time_idx on public.feedback(created_at desc,id desc);
alter table public.feedback enable row level security;
revoke all on public.feedback from public,anon,authenticated,service_role;
grant select on public.feedback to authenticated,service_role;
create policy feedback_admin_read on public.feedback for select to authenticated using ((select public.is_admin()));
create trigger fence_family_write before insert or update on public.feedback
  for each row execute function public.fence_family_write();
create trigger fence_child_delete_write before insert or update on public.feedback
  for each row execute function public.fence_child_delete_write();

create function public.submit_feedback(p_parent uuid,p_request uuid,p_child uuid,p_product text,p_text text,p_source text)
returns text language plpgsql security definer set search_path = '' as $$
declare prior public.feedback; at_time timestamptz;
begin
  -- Match family/child-deletion admission: parent first. This also serializes rate admission and retry checks.
  perform 1 from public.parents where id=p_parent and deletion_requested_at is null for update;
  if not found then return 'family_unavailable'; end if;
  if p_child is not null and (not exists(select 1 from public.children where id=p_child and parent_id=p_parent)
      or exists(select 1 from public.child_deletions where child_id=p_child)) then return 'child_unavailable'; end if;
  if p_request is null or p_product is null or p_text is null or p_source is null then
    raise exception 'invalid_feedback' using errcode='22023';
  end if;
  select * into prior from public.feedback where parent_id=p_parent and request_id=p_request;
  if found then
    if prior.child_id is not distinct from p_child and prior.product=p_product and prior.text=p_text and prior.source=p_source then return 'duplicate'; end if;
    return 'conflict';
  end if;
  -- Take the time only after acquiring the row lock. App clocks cannot widen this window.
  at_time := clock_timestamp();
  if (select count(*) from public.feedback where parent_id=p_parent and created_at>at_time-interval '1 hour')>=5 then return 'rate_limited'; end if;
  insert into public.feedback(parent_id,child_id,request_id,product,text,source,created_at)
    values(p_parent,p_child,p_request,p_product,p_text,p_source,at_time);
  return 'saved';
end $$;
revoke all on function public.submit_feedback(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_feedback(uuid,uuid,uuid,text,text,text) to service_role;
