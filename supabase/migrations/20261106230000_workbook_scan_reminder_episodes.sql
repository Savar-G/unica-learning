-- #475. Local candidate. No calendar arithmetic, transport, billing, queue or historical scan admission.
-- The trusted service computes calendars with scanInactivityCandidate and family-time.ts.

create table public.workbook_scan_inactivity_episodes (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null,
  workbook_id uuid not null,
  number integer not null,
  printed_revision text not null,
  -- Identity follows accepted work, never a zone, delivery correction or scheduler run.
  -- The nil key is the delivery-only episode. Earlier-than-delivery work still has its own activity identity.
  activity_key uuid not null,
  activity_receipt_id uuid references public.workbook_scan_receipts(id) on delete cascade,
  delivery_audit_id bigint not null references public.workbook_audit(id) on delete cascade,
  anchor_at timestamptz not null check(isfinite(anchor_at) and date_trunc('milliseconds',anchor_at)=anchor_at),
  due_at timestamptz not null check(isfinite(due_at) and date_trunc('milliseconds',due_at)=due_at and due_at>anchor_at),
  clock_context jsonb not null check(jsonb_typeof(clock_context)='object'),
  clock_version text not null check(char_length(clock_version) between 1 and 200),
  calendar_revision uuid not null default gen_random_uuid(),
  dispatch_count smallint not null default 0 check(dispatch_count between 0 and 3),
  consumed_at timestamptz,
  consumed_token uuid,
  created_at timestamptz not null default clock_timestamp(),
  refreshed_at timestamptz not null default clock_timestamp(),
  unique(workbook_id,activity_key),
  check((consumed_at is null)=(consumed_token is null)),
  check(activity_key=coalesce(activity_receipt_id,'00000000-0000-0000-0000-000000000000'::uuid)),
  foreign key(child_id,parent_id) references public.children(id,parent_id) on delete cascade,
  foreign key(workbook_id,parent_id,child_id,number) references public.workbooks(id,parent_id,child_id,number) on delete cascade
);
create index workbook_scan_inactivity_parent on public.workbook_scan_inactivity_episodes(parent_id,due_at,id);

create table public.workbook_scan_reminder_messages (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents(id) on delete cascade,
  email_log_id uuid not null unique references public.email_log(id) on delete cascade,
  state text not null check(state in ('reserved','admitted','sent','refused','unknown','released')),
  attempt_count smallint not null check(attempt_count between 1 and 3),
  attempt_token uuid not null unique,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index workbook_scan_reminder_parent on public.workbook_scan_reminder_messages(parent_id,id);
create table public.workbook_scan_reminder_links (
  episode_id uuid not null references public.workbook_scan_inactivity_episodes(id) on delete cascade,
  message_id uuid not null references public.workbook_scan_reminder_messages(id) on delete cascade,
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null,
  calendar_revision uuid not null,
  released boolean not null default false,
  primary key(message_id,episode_id),
  foreign key(child_id,parent_id) references public.children(id,parent_id) on delete cascade
);
create unique index workbook_scan_reminder_active_episode on public.workbook_scan_reminder_links(episode_id) where not released;
create index workbook_scan_reminder_link_message on public.workbook_scan_reminder_links(message_id,episode_id);
create table public.workbook_scan_reminder_attempts (
  token uuid primary key,
  message_id uuid not null references public.workbook_scan_reminder_messages(id) on delete cascade,
  parent_id uuid not null references public.parents(id) on delete cascade,
  attempt smallint not null check(attempt between 1 and 3),
  state text not null check(state in ('reserved','admitted','sent','refused','unknown','released')),
  reserved_at timestamptz not null default clock_timestamp(),
  admitted_at timestamptz,
  finished_at timestamptz
);
-- A reservation released before dispatch does not use a transport attempt. Retain its token evidence.
create unique index workbook_scan_reminder_attempt_number on public.workbook_scan_reminder_attempts(message_id,attempt) where state<>'released';

-- Expand only the kind and parent/child constraint. Every old kind retains its old checks and indexes.
alter table public.email_log drop constraint email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check check(kind in
  ('continue','come_back','start','start_followup','unsubscribe','maya_daily','maya_weekly','maya_unsubscribe',
   'monthly_summary','monthly_summary_unsubscribe','scan_inactivity'));
alter table public.email_log drop constraint email_log_check;
alter table public.email_log add constraint email_log_check check
  ((kind in ('unsubscribe','maya_unsubscribe','maya_daily','maya_weekly','monthly_summary','monthly_summary_unsubscribe','scan_inactivity'))=(child_id is null));

do $$ declare t text; begin
  foreach t in array array['workbook_scan_inactivity_episodes','workbook_scan_reminder_messages',
    'workbook_scan_reminder_links','workbook_scan_reminder_attempts'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
    execute format('grant select on public.%I to service_role,authenticated',t);
    execute format('create policy scan_reminder_admin_read on public.%I for select to authenticated using ((select public.is_admin()))',t);
    execute format('create trigger fence_family_write before insert or update on public.%I for each row execute function public.fence_family_write()',t);
    if t='workbook_scan_reminder_links' then
      -- Releasing an unsent reservation creates no child fact and remains safe after a child tombstone.
      execute format('create trigger fence_child_delete_write before insert or update on public.%I for each row when (not new.released) execute function public.fence_child_delete_write()',t);
    elsif t='workbook_scan_inactivity_episodes' then
      execute format('create trigger fence_child_delete_write before insert or update on public.%I for each row execute function public.fence_child_delete_write()',t);
    end if;
  end loop;
end $$;

-- No GUC or caller-provided Boolean authorizes direct ledger writes. This invoker trigger distinguishes the
-- definer RPC owner from a direct service-role write. Existing kinds take no new locks and keep their behavior.
create function public.guard_workbook_scan_reminder_email() returns trigger
language plpgsql set search_path='' as $$
begin
  if (case when tg_op='DELETE' then old.kind else new.kind end)='scan_inactivity'
    or (tg_op='UPDATE' and old.kind='scan_inactivity') then
    if current_user<>pg_get_userbyid((select relowner from pg_class where oid='public.workbook_scan_reminder_messages'::regclass)) then
      raise exception 'scan_reminder_rpc_required' using errcode='42501';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger guard_scan_reminder_email before insert or update or delete on public.email_log
  for each row execute function public.guard_workbook_scan_reminder_email();

-- The whole new aggregate and its copy leave with any included child. The parent ledger/token remains,
-- as in the existing child email deletion contract. A surviving episode keeps its dispatch consumption.
create function public.delete_child_workbook_scan_reminders() returns trigger
language plpgsql security definer set search_path='' as $$
declare logs uuid[];
begin
  logs:=array(
    select m.email_log_id from public.workbook_scan_reminder_messages m
    join public.workbook_scan_reminder_links l on l.message_id=m.id where l.child_id=old.id and l.parent_id=old.parent_id);
  delete from public.email_copies where email_log_id=any(logs);
  if exists(select 1 from public.parents where id=old.parent_id and deletion_requested_at is null) then
    update public.email_log set copy_redacted=true where id=any(logs);
  end if;
  delete from public.workbook_scan_reminder_messages where email_log_id=any(logs);
  return old;
end $$;
create trigger delete_child_scan_reminders before delete on public.children
  for each row execute function public.delete_child_workbook_scan_reminders();

-- Raw source identity only. SQL neither resolves a zone nor implements its dated arithmetic.
create function public._workbook_scan_family_clock_context(p_parent uuid) returns jsonb
language sql security definer set search_path='' as $$
  select jsonb_build_object('version',1,'timeZone',p.time_zone,'postal',p.postal,
    'oldestChild',(select jsonb_build_object('id',c.id,'createdAt',c.created_at,'province',c.province)
      from public.children c where c.parent_id=p.id order by c.created_at,c.id limit 1))
    from public.parents p where p.id=p_parent;
$$;

-- Read only after the parent/book locks in writing RPCs. No scan/photo/item/plan row lock occurs here.
create function public._workbook_scan_inactivity_identity(p_book uuid,p_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.workbooks; r public.workbook_delivery_receipts; c public.workbook_delivery_corrections;
  activity public.workbook_scan_receipts; delivered timestamptz; required uuid[]; unfinished boolean;
begin
  select * into w from public.workbooks where id=p_book;
  if not found or w.status<>'shipped' or w.printed_revision !~ '^[0-9a-f]{28}$' or w.printed_revision is null
    or not exists(select 1 from public.parents where id=w.parent_id and deletion_requested_at is null)
    or exists(select 1 from public.child_deletions where child_id=w.child_id) then return null; end if;
  required:=public._workbook_scan_day7(w.id);
  if required is null then return null; end if;
  select * into r from public.workbook_delivery_receipts
    where workbook_id=w.id and parent_id=w.parent_id and child_id=w.child_id and number=w.number;
  if not found then return null; end if;
  -- A newer confirmed numbered book suppresses this reminder even if it is now complete or unsupported.
  if exists(select 1 from public.workbook_delivery_receipts newer where newer.child_id=w.child_id and newer.parent_id=w.parent_id
    and (newer.number>w.number or (newer.number=w.number and newer.workbook_id<>w.id))) then return null; end if;
  select * into c from public.workbook_delivery_corrections where workbook_id=w.id order by audit_id desc limit 1;
  delivered:=coalesce(c.delivered_at,r.delivered_at);
  if not isfinite(delivered) or delivered>p_at then return null; end if;
  select exists(select 1 from jsonb_array_elements(w.print_manifest->'days') d,
    lateral jsonb_array_elements_text(d->'pages') n
    join public.workbook_pages page on page.workbook_id=w.id and page.parent_id=w.parent_id and page.page_number=n.value::integer
    where not exists(select 1 from public.workbook_scan_receipts s where s.workbook_id=w.id and s.parent_id=w.parent_id
      and s.child_id=w.child_id and s.printed_revision=w.printed_revision and s.page_id=page.id and s.accepted_at<=p_at)) into unfinished;
  if not unfinished then return null; end if;
  -- First page work and genuine pending-resolution retakes qualify. Use accepted_at, not admitted_at.
  -- Date.parse truncates fractional milliseconds. Compare and return precisely the same anchor as the helper.
  select s.* into activity from public.workbook_scan_receipts s join public.workbook_pages page on page.id=s.page_id
    and page.workbook_id=w.id and page.parent_id=w.parent_id
    where s.workbook_id=w.id and s.parent_id=w.parent_id and s.child_id=w.child_id and s.printed_revision=w.printed_revision
      and s.accepted_at<=p_at and page.page_type not in ('cover','how-plan','back-cover','blank')
      and exists(select 1 from public.workbook_questions q where q.page_id=page.id and q.parent_id=w.parent_id)
      and (not exists(select 1 from public.workbook_scan_receipts earlier where earlier.workbook_id=w.id
        and earlier.printed_revision=w.printed_revision and earlier.page_id=s.page_id
        and (earlier.accepted_at,earlier.id)<(s.accepted_at,s.id))
        or exists(select 1 from public.workbook_scan_progress_events e where e.receipt_id=s.id and e.parent_id=w.parent_id
          and e.child_id=w.child_id and e.workbook_id=w.id and e.printed_revision=w.printed_revision and e.page_id=s.page_id
          and e.admitted_at<=p_at and e.admitted_at>=s.accepted_at
          and exists(select 1 from public.workbook_scan_receipts earlier where earlier.workbook_id=w.id
            and earlier.printed_revision=w.printed_revision and earlier.page_id=s.page_id
            and date_trunc('milliseconds',earlier.accepted_at)<date_trunc('milliseconds',s.accepted_at))))
    order by s.accepted_at desc,s.id desc limit 1;
  return jsonb_build_object('workbook_id',w.id,'parent_id',w.parent_id,'child_id',w.child_id,'number',w.number,
    'printed_revision',w.printed_revision,'delivery_audit_id',coalesce(c.audit_id,r.audit_id),'delivered_at',delivered,
    'delivery_time_zone',r.time_zone,'delivery_zone_override',r.zone_override,'activity_receipt_id',activity.id,
    'activity_key',coalesce(activity.id,'00000000-0000-0000-0000-000000000000'::uuid),
    'anchor_at',date_trunc('milliseconds',greatest(delivered,activity.accepted_at)),
    'zone_mode',case when date_trunc('milliseconds',activity.accepted_at)>date_trunc('milliseconds',delivered) then 'family' else 'delivery' end,
    'clock_context',public._workbook_scan_family_clock_context(w.parent_id));
end $$;

-- Finite backfill: completed books disappear. Root can drain unseeded to empty without a volatile offset.
-- A keyset is available for a bounded sweep. Start a later sweep at NULL to pick up new/corrected books.
create function public.list_workbook_scan_recovery_books(p_kind text,p_limit integer,p_after uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare answer jsonb;
begin
  if p_kind is null or p_kind not in ('unseeded','due','inactivity') or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'invalid_scan_recovery_batch'; end if;
  select coalesce(jsonb_agg(to_jsonb(batch) order by batch.workbook_id),'[]'::jsonb) into answer from (
    select w.id workbook_id,w.parent_id,w.child_id,w.number,e.audit delivery_audit_id
    from public.workbooks w join public.parents p on p.id=w.parent_id
    join public.workbook_delivery_receipts r on r.workbook_id=w.id and r.parent_id=w.parent_id and r.child_id=w.child_id and r.number=w.number
    cross join lateral (select coalesce((select max(c.audit_id) from public.workbook_delivery_corrections c where c.workbook_id=w.id),r.audit_id) audit) e
    where w.status='shipped' and w.printed_revision ~ '^[0-9a-f]{28}$' and p.deletion_requested_at is null
      and not exists(select 1 from public.child_deletions d where d.child_id=w.child_id)
      and (p_after is null or w.id>p_after) and public._workbook_scan_day7(w.id) is not null
      and case p_kind
        when 'unseeded' then not exists(select 1 from public.workbook_scan_clock_requests q where q.delivery_audit_id=e.audit)
        when 'due' then exists(select 1 from public.workbook_scan_delivery_calendars calendar where calendar.delivery_audit_id=e.audit and calendar.backstop_at<=clock_timestamp())
          and not exists(select 1 from public.workbook_scan_trigger_claims claim where claim.workbook_id=w.id)
          and not exists(select 1 from public.workbook_scan_backstop_holds hold where hold.workbook_id=w.id and hold.delivery_audit_id=e.audit)
        when 'inactivity' then public._workbook_scan_inactivity_identity(w.id,clock_timestamp()) is not null
      end
    order by w.id limit p_limit
  ) batch;
  return answer;
end $$;

-- Parent first, then book KEY SHARE before book gate in UUID order. Receipt/delivery already use the parent
-- SHARE fence first. No code here waits for a photo, calibration, canonical item, child or plan row afterwards.
-- All sibling candidates are locked, not just the caller's proposed set. New delivery also needs parent SHARE.
create function public._lock_workbook_scan_reminder_parent(p_parent uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare book uuid; books uuid[];
begin
  perform 1 from public.parents where id=p_parent for no key update;
  if not found then return false; end if;
  perform public.assert_family_writable(p_parent);
  select array_agg(workbook_id order by workbook_id) into books from (
    select workbook_id from (
      select distinct on (r.child_id) r.workbook_id,r.child_id from public.workbook_delivery_receipts r
      where r.parent_id=p_parent and not exists(select 1 from public.child_deletions d where d.child_id=r.child_id)
      order by r.child_id,r.number desc,r.workbook_id
    ) latest order by workbook_id limit 101
  ) bounded;
  if cardinality(books)>100 then return false; end if;
  foreach book in array coalesce(books,'{}'::uuid[]) loop
    perform public._lock_workbook_scan_book(book);
  end loop;
  return true;
end $$;

create function public.read_workbook_scan_inactivity_context(p_book uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p uuid;
begin
  select parent_id into p from public.workbooks where id=p_book;
  if p is null or not public._lock_workbook_scan_reminder_parent(p) then return jsonb_build_object('status','unavailable'); end if;
  return jsonb_build_object('status','read','identity',public._workbook_scan_inactivity_identity(p_book,clock_timestamp()));
end $$;

create function public.propose_workbook_scan_inactivity(p_book uuid,p_delivery_audit bigint,p_activity uuid,
  p_anchor timestamptz,p_due timestamptz,p_context jsonb,p_clock_version text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p uuid; ident jsonb; e public.workbook_scan_inactivity_episodes;
begin
  select parent_id into p from public.workbooks where id=p_book;
  if p is null or not public._lock_workbook_scan_reminder_parent(p) then return jsonb_build_object('status','unavailable'); end if;
  ident:=public._workbook_scan_inactivity_identity(p_book,clock_timestamp());
  if ident is null then return jsonb_build_object('status','unavailable'); end if;
  if p_delivery_audit is distinct from (ident->>'delivery_audit_id')::bigint
    or p_activity is distinct from (ident->>'activity_receipt_id')::uuid
    or p_anchor is distinct from (ident->>'anchor_at')::timestamptz
    or p_context is distinct from ident->'clock_context' then return jsonb_build_object('status','stale'); end if;
  if p_due is null or not isfinite(p_due) or p_due<=p_anchor or date_trunc('milliseconds',p_due)<>p_due
    or p_clock_version is null or char_length(p_clock_version) not between 1 and 200 then raise exception 'invalid_scan_inactivity_calendar'; end if;
  select * into e from public.workbook_scan_inactivity_episodes where workbook_id=p_book and activity_key=(ident->>'activity_key')::uuid;
  if e.id is not null then
    -- Same context/version has one canonical computation. No arbitrary deadline replacement by a retry.
    if (e.delivery_audit_id,e.anchor_at,e.clock_context,e.clock_version) is not distinct from (p_delivery_audit,p_anchor,p_context,p_clock_version) then
      if e.due_at<>p_due then return jsonb_build_object('status','calendar-conflict'); end if;
      return jsonb_build_object('status','recorded','episode',to_jsonb(e));
    end if;
    update public.workbook_scan_inactivity_episodes set delivery_audit_id=p_delivery_audit,anchor_at=p_anchor,due_at=p_due,
      clock_context=p_context,clock_version=p_clock_version,calendar_revision=gen_random_uuid(),refreshed_at=clock_timestamp()
      where id=e.id returning * into e;
  else
    insert into public.workbook_scan_inactivity_episodes(parent_id,child_id,workbook_id,number,printed_revision,activity_key,
      activity_receipt_id,delivery_audit_id,anchor_at,due_at,clock_context,clock_version)
      values(p,(ident->>'child_id')::uuid,p_book,(ident->>'number')::integer,ident->>'printed_revision',(ident->>'activity_key')::uuid,
        p_activity,p_delivery_audit,p_anchor,p_due,p_context,p_clock_version) returning * into e;
  end if;
  return jsonb_build_object('status','recorded','episode',to_jsonb(e));
end $$;

-- Conservative email-only policy from the existing stored plan/control sources. No provider read or billing write.
-- Missing/failed/paused/not-started state, cancelled/open control, and unretired applied pause fail closed.
create function public._workbook_scan_reminder_program(p_parent uuid,p_child uuid,p_at timestamptz) returns boolean
language sql security definer set search_path='' as $$
  select exists(select 1 from public.child_plan_states s where s.parent_id=p_parent and s.child_id=p_child
    and (s.kind='paying' or (s.kind='free_month' and s.next_charge_at>p_at) or (s.kind='ending' and s.ends_at>p_at)))
    and not exists(select 1 from public.child_plan_controls c where c.parent_id=p_parent and c.child_id=p_child and c.cancelled)
    and not exists(select 1 from public.plan_control_operations o where o.parent_id=p_parent and o.child_id=p_child
      and (o.state='open' or (o.kind='pause' and o.state='applied' and o.mailing_retired_at is null)))
    and not exists(select 1 from public.plan_starts s join public.card_setups k on k.id=s.card_setup_id
      where k.parent_id=p_parent and k.child_id=p_child and s.state not in ('started','other','refused','team_ended'));
$$;

-- Every potentially included sibling needs a current canonical calendar before a set can be claimed.
-- A consumed episode stays consumed across clock changes. Unknown/reserved/admitted never expire automatically.
create function public._workbook_scan_reminder_due_set(p_parent uuid,p_at timestamptz,p_message uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b record; ident jsonb; e public.workbook_scan_inactivity_episodes; m public.workbook_scan_reminder_messages;
  ids uuid[]:='{}'; children uuid[]:='{}';
begin
  if exists(select 1 from public.email_log where parent_id=p_parent and kind='unsubscribe') then
    return jsonb_build_object('status','unsubscribed'); end if;
  for b in select workbook_id from (
    select distinct on (child_id) workbook_id,child_id from public.workbook_delivery_receipts
    where parent_id=p_parent order by child_id,number desc,workbook_id
  ) latest order by workbook_id loop
    ident:=public._workbook_scan_inactivity_identity(b.workbook_id,p_at);
    if ident is null or not public._workbook_scan_reminder_program(p_parent,(ident->>'child_id')::uuid,p_at) then continue; end if;
    select * into e from public.workbook_scan_inactivity_episodes where workbook_id=b.workbook_id and activity_key=(ident->>'activity_key')::uuid;
    if e.consumed_at is not null or e.dispatch_count>=3 then continue; end if;
    select msg.* into m from public.workbook_scan_reminder_messages msg join public.workbook_scan_reminder_links l on l.message_id=msg.id where l.episode_id=e.id and not l.released;
    if m.id is not null and m.id is distinct from p_message and (m.state<>'refused' or m.attempt_count>=3) then continue; end if;
    if e.id is null or (e.delivery_audit_id,e.anchor_at,e.clock_context,e.printed_revision) is distinct from
      ((ident->>'delivery_audit_id')::bigint,(ident->>'anchor_at')::timestamptz,ident->'clock_context',ident->>'printed_revision') then
      return jsonb_build_object('status','refresh-required','workbook_id',b.workbook_id); end if;
    if e.due_at<=p_at then ids:=array_append(ids,e.id); children:=array_append(children,e.child_id); end if;
  end loop;
  return jsonb_build_object('status','ready','episode_ids',array(select x from unnest(ids) x order by x),
    'child_ids',array(select distinct x from unnest(children) x order by x));
end $$;

create function public.read_workbook_scan_reminder_due(p_parent uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not public._lock_workbook_scan_reminder_parent(p_parent) then return jsonb_build_object('status','unavailable'); end if;
  return public._workbook_scan_reminder_due_set(p_parent,clock_timestamp());
end $$;

create function public.claim_workbook_scan_reminder(p_parent uuid,p_episodes uuid[],p_unsubscribe_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare due jsonb; ids uuid[]; included uuid[]; prior uuid[]; m public.workbook_scan_reminder_messages;
  log_id uuid; attempt_id uuid:=gen_random_uuid();
begin
  if p_episodes is null or cardinality(p_episodes) not between 1 and 100 or array_position(p_episodes,null) is not null
    or p_unsubscribe_hash is null or p_unsubscribe_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_scan_reminder_claim'; end if;
  ids:=array(select distinct x from unnest(p_episodes) x order by x);
  if cardinality(ids)<>cardinality(p_episodes) then raise exception 'invalid_scan_reminder_claim'; end if;
  if not public._lock_workbook_scan_reminder_parent(p_parent) then return jsonb_build_object('status','unavailable'); end if;
  due:=public._workbook_scan_reminder_due_set(p_parent,clock_timestamp());
  if due->>'status'<>'ready' then return due; end if;
  included:=array(select value::uuid from jsonb_array_elements_text(due->'episode_ids'));
  if ids is distinct from included then return jsonb_build_object('status','set-changed'); end if;
  prior:=array(select distinct message_id from public.workbook_scan_reminder_links where episode_id=any(ids) and not released);
  if cardinality(prior)>1 then return jsonb_build_object('status','set-changed'); end if;
  if cardinality(prior)=1 then
    select * into m from public.workbook_scan_reminder_messages where id=prior[1] and parent_id=p_parent;
    if m.state<>'refused' or m.attempt_count>=3 then return jsonb_build_object('status','busy'); end if;
    if ids is distinct from array(select episode_id from public.workbook_scan_reminder_links where message_id=m.id order by episode_id) then
      return jsonb_build_object('status','set-changed'); end if;
    update public.workbook_scan_reminder_messages set state='reserved',attempt_count=attempt_count+1,
      attempt_token=attempt_id,updated_at=clock_timestamp() where id=m.id returning * into m;
    update public.workbook_scan_reminder_links l set calendar_revision=e.calendar_revision
      from public.workbook_scan_inactivity_episodes e where l.message_id=m.id and e.id=l.episode_id;
    update public.email_log set status='claimed',attempts=m.attempt_count,unsubscribe_hash=p_unsubscribe_hash,error=null where id=m.email_log_id;
  else
    insert into public.email_log(parent_id,kind,status,attempts,unsubscribe_hash,copy_child_ids)
      values(p_parent,'scan_inactivity','claimed',1,p_unsubscribe_hash,
        array(select value::uuid from jsonb_array_elements_text(due->'child_ids'))) returning id into log_id;
    insert into public.workbook_scan_reminder_messages(parent_id,email_log_id,state,attempt_count,attempt_token)
      values(p_parent,log_id,'reserved',1,attempt_id) returning * into m;
    insert into public.workbook_scan_reminder_links(episode_id,message_id,parent_id,child_id,calendar_revision)
      select id,m.id,p_parent,child_id,calendar_revision from public.workbook_scan_inactivity_episodes where id=any(ids);
  end if;
  insert into public.workbook_scan_reminder_attempts(token,message_id,parent_id,attempt,state)
    values(attempt_id,m.id,p_parent,m.attempt_count,'reserved');
  return jsonb_build_object('status','claimed','message_id',m.id,'attempt_token',m.attempt_token,'email_log_id',m.email_log_id,
    'attempt',m.attempt_count,'episode_ids',ids,'child_ids',due->'child_ids');
end $$;

-- Explicit release is safe only before admission, with the current attempt token. Never erase an unknown.
create function public.release_workbook_scan_reminder(p_message uuid,p_attempt uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.workbook_scan_reminder_messages; p uuid;
begin
  select parent_id into p from public.workbook_scan_reminder_messages where id=p_message;
  if p is null then return jsonb_build_object('status','stale'); end if;
  perform 1 from public.parents where id=p for no key update;
  select * into m from public.workbook_scan_reminder_messages where id=p_message;
  if m.attempt_token is distinct from p_attempt or m.state<>'reserved' then return jsonb_build_object('status','stale'); end if;
  update public.workbook_scan_reminder_attempts set state='released',finished_at=clock_timestamp() where token=p_attempt and state='reserved';
  update public.workbook_scan_reminder_messages set state=case when m.attempt_count=1 then 'released' else 'refused' end,
    attempt_count=greatest(1,m.attempt_count-1),updated_at=clock_timestamp() where id=m.id;
  -- Keep the audit ledger. A release has no transport result. The old unsubscribe hash remains usable.
  update public.email_log set status='failed',attempts=greatest(1,m.attempt_count-1),error='scan_inactivity_not_dispatched' where id=m.email_log_id;
  if m.attempt_count=1 then
    update public.workbook_scan_reminder_links set released=true where message_id=m.id;
  end if;
  return jsonb_build_object('status','released');
end $$;

-- Call after pacing and immediately before the transport request. The committed admitted row is the admission point.
-- A replay returns busy: it never grants another dispatch. A lost reply therefore cannot cause an automatic resend.
create function public.admit_workbook_scan_reminder(p_message uuid,p_attempt uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.workbook_scan_reminder_messages; due jsonb; p uuid; ids uuid[]; current_ids uuid[];
begin
  select parent_id into p from public.workbook_scan_reminder_messages where id=p_message;
  if p is null then return jsonb_build_object('status','stale'); end if;
  if not public._lock_workbook_scan_reminder_parent(p) then return jsonb_build_object('status','unavailable'); end if;
  select * into m from public.workbook_scan_reminder_messages where id=p_message;
  if m.attempt_token is distinct from p_attempt then return jsonb_build_object('status','stale'); end if;
  if m.state<>'reserved' then return jsonb_build_object('status','busy'); end if;
  ids:=array(select episode_id from public.workbook_scan_reminder_links where message_id=m.id order by episode_id);
  due:=public._workbook_scan_reminder_due_set(p,clock_timestamp(),m.id);
  current_ids:=array(select value::uuid from jsonb_array_elements_text(due->'episode_ids'));
  if due->>'status'<>'ready' or cardinality(ids)=0 or ids is distinct from current_ids
    or exists(select 1 from public.workbook_scan_reminder_links l join public.workbook_scan_inactivity_episodes e on e.id=l.episode_id
      where l.message_id=m.id and l.calendar_revision<>e.calendar_revision)
    or exists(select 1 from public.workbook_scan_reminder_links l join public.child_deletions d on d.child_id=l.child_id where l.message_id=m.id) then
    perform public.release_workbook_scan_reminder(m.id,p_attempt);
    return jsonb_build_object('status','not-due','reason',coalesce(due->>'status','changed'));
  end if;
  update public.workbook_scan_reminder_messages set state='admitted',updated_at=clock_timestamp() where id=m.id;
  update public.workbook_scan_reminder_attempts set state='admitted',admitted_at=clock_timestamp() where token=p_attempt;
  update public.workbook_scan_inactivity_episodes set consumed_at=clock_timestamp(),consumed_token=p_attempt,dispatch_count=dispatch_count+1
    where id=any(ids);
  return jsonb_build_object('status','admitted','message_id',m.id,'attempt_token',p_attempt,'email_log_id',m.email_log_id,'episode_ids',ids);
end $$;

create function public.finish_workbook_scan_reminder(p_message uuid,p_attempt uuid,p_outcome text,p_email_id text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.workbook_scan_reminder_messages; p uuid;
begin
  if p_outcome is null or p_outcome not in ('sent','refused','unknown')
    or (p_outcome='sent' and (p_email_id is null or char_length(p_email_id) not between 1 and 100))
    or (p_outcome<>'sent' and p_email_id is not null) then raise exception 'invalid_scan_reminder_outcome'; end if;
  select parent_id into p from public.workbook_scan_reminder_messages where id=p_message;
  if p is null then return jsonb_build_object('status','stale'); end if;
  perform 1 from public.parents where id=p for no key update;
  select * into m from public.workbook_scan_reminder_messages where id=p_message;
  if m.attempt_token is distinct from p_attempt or m.state<>'admitted' then return jsonb_build_object('status','stale'); end if;
  update public.workbook_scan_reminder_messages set state=p_outcome,updated_at=clock_timestamp() where id=m.id;
  update public.workbook_scan_reminder_attempts set state=p_outcome,finished_at=clock_timestamp() where token=p_attempt;
  if p_outcome='refused' then
    update public.workbook_scan_inactivity_episodes e set consumed_at=null,consumed_token=null
      where consumed_token=p_attempt and exists(select 1 from public.workbook_scan_reminder_links l where l.message_id=m.id and l.episode_id=e.id);
  end if;
  update public.email_log set status=case p_outcome when 'sent' then 'sent' when 'refused' then 'failed' else 'claimed' end,
    sent_at=case when p_outcome='sent' then clock_timestamp() else null end,email_id=p_email_id,
    error=case p_outcome when 'refused' then 'scan_inactivity_transport_refused' when 'unknown' then 'scan_inactivity_transport_unknown' else null end
    where id=m.email_log_id;
  return jsonb_build_object('status','recorded');
end $$;

do $$ declare f regprocedure; begin
  for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname=any(array[
    'guard_workbook_scan_reminder_email','delete_child_workbook_scan_reminders','_workbook_scan_family_clock_context',
    '_workbook_scan_inactivity_identity','list_workbook_scan_recovery_books','_lock_workbook_scan_reminder_parent',
    'read_workbook_scan_inactivity_context','propose_workbook_scan_inactivity','_workbook_scan_reminder_program',
    '_workbook_scan_reminder_due_set','read_workbook_scan_reminder_due','claim_workbook_scan_reminder',
    'release_workbook_scan_reminder','admit_workbook_scan_reminder','finish_workbook_scan_reminder']) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
  end loop;
end $$;
grant execute on function public.list_workbook_scan_recovery_books(text,integer,uuid),
  public.read_workbook_scan_inactivity_context(uuid),
  public.propose_workbook_scan_inactivity(uuid,bigint,uuid,timestamptz,timestamptz,jsonb,text),
  public.read_workbook_scan_reminder_due(uuid),public.claim_workbook_scan_reminder(uuid,uuid[],text),
  public.release_workbook_scan_reminder(uuid,uuid),public.admit_workbook_scan_reminder(uuid,uuid),
  public.finish_workbook_scan_reminder(uuid,uuid,text,text) to service_role;
