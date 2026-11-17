-- Pending hosted application. Additive private history. No backfill of optional telemetry.
create table public.customer_activity_coverage (
  singleton boolean primary key default true check(singleton),
  available_at timestamptz not null default clock_timestamp()
);
insert into public.customer_activity_coverage default values;
alter table public.customer_activity_coverage enable row level security;
revoke all on public.customer_activity_coverage from public,anon,authenticated,service_role;
create table public.customer_activity (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid references public.children(id) on delete cascade,
  workbook_id uuid references public.workbooks(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  request_id uuid not null,
  event text not null check (event in ('page_visit','scanner_opened','maya_chat_attempt','maya_voice_attempt','contact_note','plan_confirmation')),
  page text check (page in ('home','workbooks','progress','billing','assessment','report','scanner','desk','feedback','goals')),
  actor_id uuid not null,
  note text check (length(note) between 1 and 2000),
  check ((event = 'contact_note' and note is not null and page is null and workbook_id is null)
      or (event not in ('contact_note','plan_confirmation') and note is null and page is not null)
      or (event='plan_confirmation' and note is null and page is null and child_id is not null and workbook_id is null)),
  unique(parent_id,request_id)
);
create index customer_activity_family_time on public.customer_activity(parent_id,created_at desc,id desc);
create index customer_activity_child_time on public.customer_activity(child_id,created_at desc,id desc);
create index customer_activity_time on public.customer_activity(created_at desc,id desc);
create index customer_activity_book on public.customer_activity(workbook_id) where workbook_id is not null;
create index customer_activity_retention on public.customer_activity(created_at) where event not in ('contact_note','plan_confirmation');
alter table public.customer_activity enable row level security;
revoke all on public.customer_activity from public,anon,authenticated,service_role;
-- All access is through checked functions. Even service writers cannot update facts directly.
create trigger fence_family_write before insert or update on public.customer_activity
  for each row execute function public.fence_family_write();
create trigger fence_child_delete_write before insert or update on public.customer_activity
  for each row execute function public.fence_child_delete_write();
create function public.customer_activity_no_update() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Activity is append only'; end $$;
create trigger customer_activity_no_update before update on public.customer_activity
  for each row execute function public.customer_activity_no_update();
revoke all on function public.customer_activity_no_update() from public,anon,authenticated;

create function public.record_customer_activity(p_parent uuid,p_child uuid,p_book uuid,p_request uuid,p_event text,p_page text,p_actor uuid,p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare t timestamptz := clock_timestamp(); recent integer;
begin
  -- Lock the parent before deduplication and admission. Concurrent retries cannot consume extra rows.
  perform 1 from public.parents where id=p_parent and deletion_requested_at is null for update;
  if not found then return 'unavailable'; end if;
  if p_child is not null and (not exists(select 1 from public.children where id=p_child and parent_id=p_parent)
    or exists(select 1 from public.child_deletions where child_id=p_child)) then return 'refused'; end if;
  if p_book is not null and not exists(select 1 from public.workbooks where id=p_book and parent_id=p_parent and child_id=p_child) then return 'refused'; end if;
  if p_event='contact_note' then
    if not exists(select 1 from public.admin_users where user_id=p_actor) or p_page is not null or p_book is not null
      or p_note is null or length(trim(p_note)) not between 1 and 2000 then return 'refused'; end if;
  elsif p_event in ('page_visit','scanner_opened','maya_chat_attempt','maya_voice_attempt') then
    if p_actor<>p_parent or p_note is not null or p_page is null
      or p_page not in ('home','workbooks','progress','billing','assessment','report','scanner','desk','feedback','goals')
      or (p_event='scanner_opened' and (p_page<>'scanner' or p_child is null))
      or (p_event in ('maya_chat_attempt','maya_voice_attempt') and (p_page<>'desk' or p_child is null or p_book is null)) then return 'refused'; end if;
  else return 'refused'; end if;
  if p_request is null then return 'refused'; end if;
  if exists(select 1 from public.customer_activity where parent_id=p_parent and request_id=p_request) then return 'duplicate'; end if;
  -- Collapse reload/retry noise in each context, separately from request id deduplication.
  if p_event<>'contact_note' and exists(select 1 from public.customer_activity where parent_id=p_parent
    and child_id is not distinct from p_child and workbook_id is not distinct from p_book
    and event=p_event and page=p_page and created_at>t-interval '1 minute') then return 'duplicate'; end if;
  select count(*) into recent from public.customer_activity where parent_id=p_parent and created_at>t-interval '1 hour';
  if recent>=120 then return 'rate_limited'; end if;
  insert into public.customer_activity(parent_id,child_id,workbook_id,request_id,event,page,actor_id,note)
    values(p_parent,p_child,p_book,p_request,p_event,p_page,p_actor,p_note);
  return 'saved';
end $$;
revoke all on function public.record_customer_activity(uuid,uuid,uuid,uuid,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.record_customer_activity(uuid,uuid,uuid,uuid,text,text,uuid,text) to service_role;

create function public.purge_customer_activity() returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.customer_activity where id in (select id from public.customer_activity
    where event not in ('contact_note','plan_confirmation') and created_at<clock_timestamp()-interval '90 days' order by created_at limit 10000);
  get diagnostics n=row_count; return n;
end $$;
revoke all on function public.purge_customer_activity() from public,anon,authenticated;
grant execute on function public.purge_customer_activity() to service_role;

-- Only a successful retained plan start can create this durable team confirmation.
create function public.record_customer_plan_actor(p_card uuid,p_generation integer,p_actor uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare s public.plan_starts; c public.card_setups;
begin
 if not exists(select 1 from public.admin_users where user_id=p_actor) then return 'refused'; end if;
 select * into c from public.card_setups where id=p_card;
 if not found then return 'refused'; end if;
 perform 1 from public.parents where id=c.parent_id and deletion_requested_at is null for update;
 if not found then return 'unavailable'; end if;
 if exists(select 1 from public.child_deletions where child_id=c.child_id) then return 'unavailable'; end if;
 select * into s from public.plan_starts where card_setup_id=p_card and generation=p_generation and parent_id=c.parent_id and state='started';
 if not found then return 'refused'; end if;
 insert into public.customer_activity(parent_id,child_id,request_id,event,actor_id)
 values(c.parent_id,c.child_id,md5('plan-confirmation:'||s.start_key)::uuid,'plan_confirmation',p_actor)
 on conflict(parent_id,request_id) do nothing;
 return 'saved';
end $$;
revoke all on function public.record_customer_plan_actor(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.record_customer_plan_actor(uuid,integer,uuid) to service_role;

-- Private view: no client receives direct SELECT. Every exposed reader below checks is_admin.
create view public.customer_activity_history as
select 'activity:'||a.id::text key,a.created_at at,a.parent_id,a.child_id,a.workbook_id,
 case when a.event='plan_confirmation' then 'plan' when a.event='contact_note' then 'note' when a.event='page_visit' then 'visit' else 'attempt' end type,
 case when a.event in ('contact_note','plan_confirmation') then 'team' else 'parent' end actor,a.actor_id,
 case a.event when 'plan_confirmation' then 'Plan start confirmed by team' when 'contact_note' then 'Contact note' when 'page_visit' then 'Page visited: '||a.page
 when 'scanner_opened' then 'Scanner opened. No completion recorded by this event.'
 when 'maya_chat_attempt' then 'Maya chat requested. No completion recorded by this event.'
 else 'Maya voice requested. No completion recorded by this event.' end label,
 '/admin/parents/'||a.parent_id::text href,a.note
from public.customer_activity a where a.event in ('contact_note','plan_confirmation') or a.created_at>=now()-interval '90 days'
union all select 'signup:'||p.id,p.created_at,p.id,null,null,'account','parent',null,'Family account created','/admin/parents/'||p.id,null from public.parents p
union all select 'child_added:'||c.id,c.created_at,c.parent_id,c.id,null,'account','parent',null,'Child added','/admin/children/'||c.id,null from public.children c
union all select 'card:'||c.id,c.card_saved_at,c.parent_id,c.child_id,null,'plan','parent',null,'Payment card saved','/admin/parents/'||c.parent_id,null from public.card_setups c where c.card_saved_at is not null
union all select 'workbook_email:'||e.id,e.created_at,e.parent_id,e.child_id,null,'email','system',null,'Workbook email record. Current state: '||e.status,'/admin/emails',null from public.workbook_emails e
union all select 'report:'||r.id,r.created_at,r.parent_id,r.child_id,null,'assessment','system',null,'Assessment report saved','/admin/reports/'||r.id,null from public.reports r
union all select 'report_email:'||r.id,r.emailed_at,r.parent_id,r.child_id,null,'email','system',null,'Report email attempt recorded','/admin/reports/'||r.id,null from public.reports r where r.emailed_at is not null
union all select 'card_open:'||c.id,c.created_at,c.parent_id,c.child_id,null,'plan','parent',null,'Payment setup opened','/admin/parents/'||c.parent_id,null from public.card_setups c
union all select 'assessment_start:'||a.id,a.started_at,a.parent_id,a.child_id,null,'assessment','child',null,'Assessment started','/admin/assessments/'||a.id,null from public.assessments a
union all select 'answer:'||x.id,x.created_at,a.parent_id,a.child_id,null,'assessment','child',null,'Assessment answer saved','/admin/assessments/'||a.id,null from public.answers x join public.assessments a on a.id=x.assessment_id
union all select 'fact_answer:'||x.id,x.created_at,a.parent_id,a.child_id,null,'assessment','child',null,'Math fact answer saved','/admin/assessments/'||a.id,null from public.fact_answers x join public.assessments a on a.id=x.assessment_id
union all select 'assessment_end:'||a.id,a.completed_at,a.parent_id,a.child_id,null,'assessment','child',null,'Assessment completed','/admin/assessments/'||a.id,null from public.assessments a where a.completed_at is not null
union all select 'scan:'||r.id,r.accepted_at,r.parent_id,r.child_id,r.workbook_id,'scan','parent',null,'Scan accepted. Marking is separate.','/admin/workbooks/'||r.workbook_id,null from public.workbook_scan_receipts r
union all select 'photo:'||p.id,p.created_at,p.parent_id,p.child_id,p.workbook_id,'scan','parent',null,'Photo upload recorded. Current state: '||p.state,'/admin/scans',null from public.scan_photos p
union all select 'mark:'||m.id,m.changed_at,m.parent_id,m.child_id,i.workbook_id,'mark',case when m.actor='admin' then 'team' else 'parent' end,m.admin_id,'Manual mark saved','/admin/scans',null
 from public.scan_mark_changes m left join public.scan_marking_items i on i.id=m.item_id
union all select 'maya_start:'||m.id,coalesce(m.started_at,m.created_at),m.parent_id,m.child_id,m.workbook_id,'maya','child',null,'Maya session recorded. Current state: '||m.status,'/admin/maya/'||m.id,null from public.maya_calls m where m.kind<>'admin_test'
union all select 'maya_end:'||m.id,m.ended_at,m.parent_id,m.child_id,m.workbook_id,'maya','child',null,'Maya session ended','/admin/maya/'||m.id,null from public.maya_calls m where m.ended_at is not null and m.kind<>'admin_test'
union all select 'feedback:'||f.id,f.created_at,f.parent_id,f.child_id,null,'feedback','parent',null,'Feedback received','/admin/feedback',null from public.feedback f
union all select 'delivery:'||r.audit_id,r.recorded_at,r.parent_id,r.child_id,r.workbook_id,'delivery','team',r.actor_id,'Delivery confirmed','/admin/workbooks/'||r.workbook_id,null from public.workbook_delivery_receipts r
union all select 'delivery_correction:'||r.id,r.recorded_at,r.parent_id,r.child_id,r.workbook_id,'delivery','team',r.actor_id,'Delivery corrected','/admin/workbooks/'||r.workbook_id,null from public.workbook_delivery_corrections r
union all select 'workbook:'||w.id,w.at,w.parent_id,w.child_id,w.workbook_id,'workbook',case when w.actor_id is null then 'system' else 'team' end,w.actor_id,'Workbook action: '||w.action,
 case when w.workbook_id is not null then '/admin/workbooks/'||w.workbook_id
      when w.run_id is not null then '/admin/workbooks/runs/'||w.run_id
      else '/admin/parents/'||w.parent_id end,null from public.workbook_audit w
union all select 'plan:'||p.id,p.created_at,p.parent_id,p.child_id,null,'plan','unknown',null,'Plan change recorded. Current state: '||p.state,'/admin/parents/'||p.parent_id,null from public.plan_control_operations p
union all select 'plan_start:'||s.card_setup_id::text||'-'||s.generation::text,s.started_at,s.parent_id,c.child_id,null,'plan','unknown',null,'Plan start recorded. Current state: '||s.state,'/admin/parents/'||s.parent_id,null from public.plan_starts s join public.card_setups c on c.id=s.card_setup_id
union all select 'email:'||e.id,e.created_at,e.parent_id,e.child_id,null,'email','system',null,'Email record. Current state: '||coalesce(e.status,'unknown'),'/admin/emails',null from public.email_log e
union all select 'email_send:'||e.id,e.created_at,e.parent_id,e.child_id,null,'email','system',null,'Email attempt: '||e.outcome,'/admin/emails',null from public.email_sends e where e.parent_id is not null;
revoke all on public.customer_activity_history from public,anon,authenticated,service_role;

create function public.admin_customer_history(p_parent uuid default null,p_child uuid default null,p_book uuid default null,p_from timestamptz default now()-interval '30 days',p_to timestamptz default now(),p_type text default null,p_actor text default null,p_after_at timestamptz default null,p_after_key text default null,p_tests boolean default false,p_search text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
 if not public.is_admin() then raise insufficient_privilege; end if;
 if p_from>=p_to or p_to-p_from>interval '366 days' or (p_after_at is null)<>(p_after_key is null) then raise exception 'Invalid activity filters'; end if;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.at desc,r.key desc),'[]') into result from (
 select h.*,p.name family_name,c.first_name child_name,
   (exists(select 1 from public.test_accounts t where t.parent_id=p.id) or exists(select 1 from public.admin_users a where a.user_id=p.id)) test,
   case when h.actor_id is not null and h.actor='team' then coalesce(actor.name,'Former team member') else null end actor_name
 from public.customer_activity_history h join public.parents p on p.id=h.parent_id
 left join public.children c on c.id=h.child_id and c.parent_id=h.parent_id
 left join public.admin_users actor on actor.user_id=h.actor_id
 where (p_parent is null or h.parent_id=p_parent) and (p_child is null or h.child_id=p_child)
 and (p_search is null or p.name ilike '%'||p_search||'%' or c.first_name ilike '%'||p_search||'%')
 and (p_book is null or h.workbook_id=p_book) and h.at>=p_from and h.at<p_to
 and (p_type is null or h.type=p_type) and (p_actor is null or h.actor=p_actor)
 and (p_after_at is null or (h.at,h.key)<(p_after_at,p_after_key))
 and (p_tests or (not exists(select 1 from public.test_accounts t where t.parent_id=p.id) and not exists(select 1 from public.admin_users a where a.user_id=p.id)))
 order by h.at desc,h.key desc limit 51) r;
 return result;
end $$;
revoke all on function public.admin_customer_history(uuid,uuid,uuid,timestamptz,timestamptz,text,text,timestamptz,text,boolean,text) from public,anon;
grant execute on function public.admin_customer_history(uuid,uuid,uuid,timestamptz,timestamptz,text,text,timestamptz,text,boolean,text) to authenticated;

-- Meaningful work excludes repeat receipts unless the durable progress ledger admits new evidence.
create view public.customer_meaningful_work as
select r.parent_id,r.child_id,min(r.accepted_at) at from public.workbook_scan_receipts r
 join public.workbooks w on w.id=r.workbook_id and w.parent_id=r.parent_id and w.child_id=r.child_id and w.printed_revision=r.printed_revision
 where r.status='accepted' group by r.parent_id,r.child_id,r.workbook_id,r.page_id,r.printed_revision
union all select r.parent_id,r.child_id,r.accepted_at from public.workbook_scan_progress_events e
 join public.workbook_scan_receipts r on r.id=e.receipt_id and r.parent_id=e.parent_id and r.child_id=e.child_id
 join public.workbooks w on w.id=r.workbook_id and w.printed_revision=r.printed_revision
union all select a.parent_id,a.child_id,x.created_at from public.answers x join public.assessments a on a.id=x.assessment_id
union all select a.parent_id,a.child_id,x.answered_at from public.answers x join public.assessments a on a.id=x.assessment_id where x.answered_at is not null
union all select a.parent_id,a.child_id,x.created_at from public.fact_answers x join public.assessments a on a.id=x.assessment_id
union all select parent_id,child_id,last_answer_at from public.assessments where last_answer_at is not null
union all select parent_id,child_id,coalesce(started_at,created_at) from public.maya_calls where kind in ('chat','family') and child_turns>0;
revoke all on public.customer_meaningful_work from public,anon,authenticated,service_role;

-- Resolve an explicit book independently of either summary cursor. Scope and test visibility apply here.
create function public.admin_customer_book(p_book uuid,p_parent uuid default null,p_child uuid default null,p_tests boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
 if not public.is_admin() then raise insufficient_privilege; end if;
 select jsonb_build_object('id',w.id,'parent',w.parent_id,'child',w.child_id,'number',w.number,'childName',c.first_name,'familyName',p.name)
 into result from public.workbooks w join public.parents p on p.id=w.parent_id
 join public.children c on c.id=w.child_id and c.parent_id=w.parent_id
 where w.id=p_book and (p_parent is null or p.id=p_parent) and (p_child is null or c.id=p_child)
 and (p_tests or (not exists(select 1 from public.test_accounts t where t.parent_id=p.id)
   and not exists(select 1 from public.admin_users a where a.user_id=p.id)));
 return result;
end $$;
revoke all on function public.admin_customer_book(uuid,uuid,uuid,boolean) from public,anon;
grant execute on function public.admin_customer_book(uuid,uuid,uuid,boolean) to authenticated;

create function public.admin_customer_children(p_parent uuid default null,p_child uuid default null,p_after uuid default null,p_tests boolean default false,p_from timestamptz default now()-interval '30 days',p_to timestamptz default now(),p_search text default null,p_attention text default null,p_book uuid default null,p_books_before integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
 if not public.is_admin() then raise insufficient_privilege; end if;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') into result from (
 select c.id,c.parent_id,c.first_name,p.name family_name,p.postal,p.time_zone,
 (select x.province from public.children x where x.parent_id=p.id order by x.created_at,x.id limit 1) province,
 (exists(select 1 from public.test_accounts t where t.parent_id=p.id) or exists(select 1 from public.admin_users a where a.user_id=p.id)) test,
 (select max(m.at) from public.customer_meaningful_work m where m.child_id=c.id and m.parent_id=p.id) last_work,
 -- The canonical identity refuses finished, unsupported, mismatched and superseded delivered books.
 (select public._workbook_scan_inactivity_identity(w.id,now()) from public.workbooks w
   join public.workbook_delivery_receipts d on d.workbook_id=w.id and d.parent_id=p.id and d.child_id=c.id and d.number=w.number
   where w.parent_id=p.id and w.child_id=c.id order by w.number desc,w.id desc limit 1) inactivity,
 (select max(a.created_at) from public.customer_activity a where a.parent_id=p.id and (a.child_id=c.id or a.child_id is null) and a.event='page_visit' and a.created_at>=now()-interval '90 days') last_visit,
 (select s.kind from public.child_plan_states s where s.child_id=c.id and s.parent_id=p.id) plan,
 (select jsonb_build_object('id',a.id,'status',a.status,'at',a.last_answer_at,'resumeUntil',a.resume_until) from public.assessments a where a.child_id=c.id and a.parent_id=p.id order by a.started_at desc,a.id desc limit 1) assessment,
 (select jsonb_build_object('sessions',count(*),'seconds',sum(m.connected_seconds),'unknownDuration',count(*) filter(where m.connected_seconds is null),'ended',count(*) filter(where m.ended_at is not null),'withWork',count(*) filter(where m.child_turns>0),'solved',count(*) filter(where m.outcome_reason='solved'),'technical',count(*) filter(where m.outcome_reason='technical_issue'),'noOutcome',count(*) filter(where m.outcome_reason is null)) from public.maya_calls m where m.child_id=c.id and m.parent_id=p.id and m.kind in ('chat','family') and m.created_at>=p_from and m.created_at<p_to) maya,
 (select coalesce(jsonb_agg(to_jsonb(b) order by b.number desc),'[]') from (
   select w.id,w.number,w.status,
   case when x.id is null then case when d.number=w.number then d.delivered_at end
     when x.parent_id=p.id and x.child_id=c.id and x.number=w.number then x.delivered_at end delivered,
   (select min(s.accepted_at) from public.workbook_scan_receipts s where s.workbook_id=w.id and s.parent_id=p.id and s.child_id=c.id and s.printed_revision=w.printed_revision and s.status='accepted') first_scan,
   (select count(*) from public.workbook_scan_receipts s where s.workbook_id=w.id and s.parent_id=p.id and s.child_id=c.id and s.printed_revision=w.printed_revision and s.status='accepted') receipts,
   (select count(distinct s.page_id) from public.workbook_scan_receipts s where s.workbook_id=w.id and s.parent_id=p.id and s.child_id=c.id and s.printed_revision=w.printed_revision and s.status='accepted') scanned_pages,
   (select coalesce(sum(z.n-1),0) from (select count(*) n from public.scan_photos ph where ph.workbook_id=w.id and ph.parent_id=p.id and ph.child_id=c.id and ph.page_id is not null and ph.printed_revision=w.printed_revision group by ph.page_id) z) repeat_photos,
   w.printed_revision is not null and w.print_manifest is not null contract_available
   from public.workbooks w left join public.workbook_delivery_receipts d on d.workbook_id=w.id and d.parent_id=p.id and d.child_id=c.id
   left join lateral(select x.* from public.workbook_delivery_corrections x where x.workbook_id=w.id order by x.audit_id desc limit 1) x on true
   where w.parent_id=p.id and w.child_id=c.id and (p_books_before is null or w.number<p_books_before) order by w.number desc,w.id desc limit 21) b) books
 from (select c.* from public.children c where (p_parent is null or c.parent_id=p_parent) and (p_child is null or c.id=p_child)
   and (p_book is null or exists(select 1 from public.workbooks selected where selected.id=p_book and selected.child_id=c.id and selected.parent_id=c.parent_id))
   and (p_search is null or c.first_name ilike '%'||p_search||'%' or exists(select 1 from public.parents p where p.id=c.parent_id and p.name ilike '%'||p_search||'%'))
   and (p_attention is null
     or (p_attention='inactive' and exists(select 1 from public.workbooks w where w.parent_id=c.parent_id and w.child_id=c.id
       and public._workbook_scan_inactivity_identity(w.id,now()) is not null))
     or (p_attention='assessment' and (select a.status from public.assessments a where a.child_id=c.id and a.parent_id=c.parent_id order by a.started_at desc,a.id desc limit 1)='in_progress')
     or (p_attention='team' and exists(select 1 from public.scan_marking_items i join public.workbooks w on w.id=i.workbook_id and w.printed_revision=i.printed_revision where i.child_id=c.id and i.parent_id=c.parent_id
       and i.observation->>'result' is null and (i.observation->>'state'='parent-pending' or (i.observation->>'state'='pending' and (i.model is not null or i.observation->>'certainty'<>'not-read'))))))
   and (p_after is null or c.id>p_after)
   and (p_tests or (not exists(select 1 from public.test_accounts t where t.parent_id=c.parent_id) and not exists(select 1 from public.admin_users a where a.user_id=c.parent_id)))
   order by c.id limit 26) c join public.parents p on p.id=c.parent_id
 ) r;
 return result;
end $$;
revoke all on function public.admin_customer_children(uuid,uuid,uuid,boolean,timestamptz,timestamptz,text,text,uuid,integer) from public,anon;
grant execute on function public.admin_customer_children(uuid,uuid,uuid,boolean,timestamptz,timestamptz,text,text,uuid,integer) to authenticated;

create function public.admin_customer_metrics(p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
 if not public.is_admin() then raise insufficient_privilege; end if;
 if p_from>=p_to or p_to-p_from>interval '366 days' then raise exception 'Invalid activity period'; end if;
 with real as (select p.id from public.parents p where not exists(select 1 from public.test_accounts t where t.parent_id=p.id)
   and not exists(select 1 from public.admin_users a where a.user_id=p.id)),
 delivered as (select d.workbook_id,case when x.id is null then d.delivered_at
     when x.parent_id=d.parent_id and x.child_id=d.child_id and x.number=d.number then x.delivered_at end delivered_at,w.printed_revision,(w.printed_revision is not null and w.print_manifest is not null) contract_available
   from public.workbook_delivery_receipts d join real on real.id=d.parent_id
   join public.workbooks w on w.id=d.workbook_id and w.parent_id=d.parent_id and w.child_id=d.child_id and w.number=d.number
   left join lateral(select x.* from public.workbook_delivery_corrections x where x.workbook_id=d.workbook_id order by x.audit_id desc limit 1) x on true),
 observed as (select d.*,(select min(r.accepted_at) from public.workbook_scan_receipts r where r.workbook_id=d.workbook_id and r.printed_revision=d.printed_revision and r.status='accepted') first_scan
   from delivered d where d.delivered_at>=p_from and d.delivered_at<p_to)
 select jsonb_build_object(
 'families',(select count(*) from real),
 'activeFamilies',(select count(distinct m.parent_id) from public.customer_meaningful_work m join real on real.id=m.parent_id where m.at>=p_from and m.at<p_to),
 'mayaFamilies',(select count(distinct m.parent_id) from public.maya_calls m join real on real.id=m.parent_id where m.kind in ('chat','family') and m.child_turns>0 and coalesce(m.started_at,m.created_at)>=p_from and coalesce(m.started_at,m.created_at)<p_to),
 'deliveredBooks',(select count(*) from observed),
 'deliveryWithScan',(select count(*) from observed where contract_available and first_scan>=delivered_at and first_scan<p_to),
 'deliveryMissingScan',(select count(*) from observed where contract_available and first_scan is null),
 'deliveryMissingContract',(select count(*) from observed where not contract_available),
 'deliveryEarlierScan',(select count(*) from observed where contract_available and first_scan<delivered_at),
 'deliveryAfterPeriod',(select count(*) from observed where contract_available and first_scan>=p_to),
 'medianFirstScanHours',(select percentile_cont(0.5) within group(order by extract(epoch from(first_scan-delivered_at))/3600) from observed where contract_available and first_scan>=delivered_at and first_scan<p_to),
 'telemetryStart',(select available_at from public.customer_activity_coverage where singleton),
 'awaitingTeamFamilies',(select count(distinct i.parent_id) from public.scan_marking_items i join real on real.id=i.parent_id join public.workbooks w on w.id=i.workbook_id and w.printed_revision=i.printed_revision where (i.observation->>'result' is null and (i.observation->>'state'='parent-pending' or (i.observation->>'state'='pending' and (i.model is not null or i.observation->>'certainty'<>'not-read')))))
 ) into result;
 return result;
end $$;
revoke all on function public.admin_customer_metrics(timestamptz,timestamptz) from public,anon;
grant execute on function public.admin_customer_metrics(timestamptz,timestamptz) to authenticated;
