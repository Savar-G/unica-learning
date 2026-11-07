-- #475. Durable facts only. No historical admission, scheduler, queue, email or profile write.
create table public.workbook_scan_receipt_epoch (
  singleton boolean primary key default true check(singleton),
  installed_at timestamptz not null default clock_timestamp()
);
insert into public.workbook_scan_receipt_epoch default values;

create table public.workbook_scan_receipts (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null,
  workbook_id uuid not null,
  number integer not null,
  printed_revision text not null check(printed_revision ~ '^[0-9a-f]{28}$'),
  page_id uuid not null,
  -- A photo UUID is one immutable revision. Intentionally no photo FK: image cleanup cannot erase acceptance.
  photo_revision uuid not null unique,
  calibration_token uuid not null,
  accepted_at timestamptz not null default clock_timestamp(),
  status text not null default 'accepted' check(status='accepted'),
  foreign key(child_id,parent_id) references public.children(id,parent_id) on delete cascade,
  foreign key(workbook_id,parent_id,child_id,number) references public.workbooks(id,parent_id,child_id,number) on delete cascade,
  foreign key(page_id,workbook_id,parent_id) references public.workbook_pages(id,workbook_id,parent_id) on delete cascade
);
create index workbook_scan_receipts_book on public.workbook_scan_receipts(workbook_id,printed_revision,page_id,accepted_at,id);

-- Pending at acceptance, not an inference from later marking completion. No answer text is copied.
create table public.workbook_scan_pending_items (
  receipt_id uuid not null references public.workbook_scan_receipts(id) on delete cascade,
  item_row_id uuid not null references public.scan_marking_items(id) on delete cascade,
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null,
  item_id text not null,
  result_version integer not null,
  expected jsonb not null,
  primary key(receipt_id,item_row_id),
  foreign key(child_id,parent_id) references public.children(id,parent_id) on delete cascade
);
create table public.workbook_scan_progress_events (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.workbook_scan_receipts(id) on delete cascade,
  item_row_id uuid not null references public.scan_marking_items(id) on delete cascade,
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null,
  workbook_id uuid not null,
  printed_revision text not null,
  page_id uuid not null,
  item_id text not null,
  from_version integer not null,
  to_version integer not null check(to_version=from_version+1),
  reason text not null default 'pending-evidence-resolved' check(reason='pending-evidence-resolved'),
  admitted_at timestamptz not null default clock_timestamp(),
  unique(receipt_id,item_row_id),
  foreign key(receipt_id,item_row_id) references public.workbook_scan_pending_items(receipt_id,item_row_id) on delete cascade,
  foreign key(child_id,parent_id) references public.children(id,parent_id) on delete cascade,
  foreign key(page_id,workbook_id,parent_id) references public.workbook_pages(id,workbook_id,parent_id) on delete cascade
);
create index workbook_scan_progress_book on public.workbook_scan_progress_events(workbook_id,admitted_at,id);

-- The database records the effective delivery identity. Only the trusted server supplies its calendar.
-- A request survives a lost server response. Root drains requests without calendars and retries reconciliation.
create table public.workbook_scan_clock_requests (
  delivery_audit_id bigint primary key references public.workbook_audit(id) on delete cascade,
  workbook_id uuid not null references public.workbook_delivery_receipts(workbook_id) on delete cascade,
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null,
  number integer not null,
  printed_revision text not null,
  delivery_correction_id uuid references public.workbook_delivery_corrections(id) on delete cascade,
  delivered_at timestamptz not null,
  time_zone text not null,
  zone_override boolean not null,
  requested_at timestamptz not null default clock_timestamp(),
  foreign key(child_id,parent_id) references public.children(id,parent_id) on delete cascade,
  foreign key(workbook_id,parent_id,child_id,number) references public.workbooks(id,parent_id,child_id,number) on delete cascade
);
create index workbook_scan_clock_requests_book on public.workbook_scan_clock_requests(workbook_id,delivery_audit_id);
create table public.workbook_scan_delivery_calendars (
  delivery_audit_id bigint primary key references public.workbook_scan_clock_requests(delivery_audit_id) on delete cascade,
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null,
  backstop_at timestamptz not null check(isfinite(backstop_at) and date_trunc('minute',backstop_at)=backstop_at),
  clock_version text not null check(char_length(clock_version) between 1 and 200),
  recorded_at timestamptz not null default clock_timestamp(),
  foreign key(child_id,parent_id) references public.children(id,parent_id) on delete cascade
);

create table public.workbook_scan_trigger_claims (
  id uuid primary key default gen_random_uuid(),
  workbook_id uuid not null unique,
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null,
  number integer not null,
  printed_revision text not null,
  reason text not null check(reason in ('day7_scanned','delivery_backstop')),
  claimed_at timestamptz not null default clock_timestamp(),
  effective_at timestamptz not null,
  delivery_audit_id bigint not null,
  delivery_correction_id uuid,
  delivered_at timestamptz not null,
  time_zone text not null,
  zone_override boolean not null,
  -- Day 7 does not depend on a calendar. NULL means no calendar existed when that claim won.
  -- Readers join the immutable calendar by delivery_audit_id if it arrives later. Never rewrite a claim.
  backstop_at timestamptz check(reason='day7_scanned' or backstop_at is not null),
  receipt_ids uuid[] not null check(cardinality(receipt_ids)>0),
  foreign key(child_id,parent_id) references public.children(id,parent_id) on delete cascade,
  foreign key(workbook_id,parent_id,child_id,number) references public.workbooks(id,parent_id,child_id,number) on delete cascade,
  foreign key(workbook_id) references public.workbook_delivery_receipts(workbook_id) on delete cascade
);
-- A hold is an audit fact, not a trigger claim. A later scan can claim normally.
create table public.workbook_scan_backstop_holds (
  workbook_id uuid not null references public.workbook_delivery_receipts(workbook_id) on delete cascade,
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null,
  printed_revision text not null,
  delivery_audit_id bigint not null,
  delivered_at timestamptz not null,
  backstop_at timestamptz not null,
  held_at timestamptz not null default clock_timestamp(),
  reason text not null default 'no-accepted-scans-at-backstop' check(reason='no-accepted-scans-at-backstop'),
  primary key(workbook_id,delivery_audit_id),
  foreign key(child_id,parent_id) references public.children(id,parent_id) on delete cascade
);

create function public.immutable_workbook_scan_fact() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'workbook_scan_fact_immutable' using errcode='55000'; end $$;

do $$ declare t text; begin
  foreach t in array array['workbook_scan_receipt_epoch','workbook_scan_receipts','workbook_scan_pending_items',
    'workbook_scan_progress_events','workbook_scan_trigger_claims','workbook_scan_backstop_holds',
    'workbook_scan_clock_requests','workbook_scan_delivery_calendars'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
    execute format('grant select on public.%I to service_role',t);
    execute format('create trigger immutable_scan_fact before update on public.%I for each row execute function public.immutable_workbook_scan_fact()',t);
    if t<>'workbook_scan_receipt_epoch' then
      execute format('grant select on public.%I to authenticated',t);
      execute format('create policy scan_fact_admin_read on public.%I for select to authenticated using ((select public.is_admin()))',t);
      execute format('create trigger fence_family_write before insert or update on public.%I for each row execute function public.fence_family_write()',t);
      execute format('create trigger fence_child_delete_write before insert or update on public.%I for each row execute function public.fence_child_delete_write()',t);
    end if;
  end loop;
end $$;

-- Calendar arithmetic belongs to family-time.ts through deliveryDeadlines, never to PostgreSQL tzdata.
-- No SQL approximation is used for a durable backstop decision.

-- All callers must acquire book KEY SHARE before this per-book gate. Delivery already owns book UPDATE.
-- No photo/calibration/item locks are taken after this gate. Snapshot reads cannot form a reverse wait edge.
create function public._lock_workbook_scan_book(p_book uuid) returns public.workbooks
language plpgsql security definer set search_path='' as $$
declare w public.workbooks;
begin
  select * into w from public.workbooks where id=p_book;
  if not found then return null; end if;
  perform public.assert_family_writable(w.parent_id);
  if exists(select 1 from public.child_deletions where child_id=w.child_id) then raise exception 'child_unavailable' using errcode='55000'; end if;
  select * into w from public.workbooks where id=p_book for key share;
  if not found then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('workbook-scan:'||p_book::text,0));
  return w;
end $$;

-- Validate the frozen manifest against stored pages. Return NULL for unsupported or ambiguous contracts.
create function public._workbook_scan_day7(p_book uuid) returns uuid[]
language plpgsql stable security definer set search_path='' as $$
declare w public.workbooks; d jsonb; n jsonb; pg public.workbook_pages; seen integer[]:='{}'; day_numbers integer[]:='{}'; required uuid[]:='{}'; day7 jsonb;
begin
  select * into w from public.workbooks where id=p_book;
  if w.print_manifest->'version' is distinct from '1'::jsonb or w.print_manifest->'snapshotDay' is distinct from '7'::jsonb
    or jsonb_typeof(w.print_manifest->'curriculum') is distinct from 'object'
    or jsonb_typeof(w.print_manifest->'testWorkbook') is distinct from 'boolean'
    or jsonb_typeof(w.print_manifest->'days') is distinct from 'array' then return null; end if;
  if exists(select 1 from public.workbook_pages where workbook_id=w.id group by page_number having count(*)<>1) then return null; end if;
  for d in select value from jsonb_array_elements(w.print_manifest->'days') loop
    if jsonb_typeof(d->'day') is distinct from 'number' or (d->>'day') !~ '^[1-9][0-9]{0,3}$'
      or jsonb_typeof(d->'pages') is distinct from 'array' then return null; end if;
    if (d->>'day')::integer=any(day_numbers) or jsonb_array_length(d->'pages')=0 then return null; end if;
    day_numbers:=array_append(day_numbers,(d->>'day')::integer);
    for n in select value from jsonb_array_elements(d->'pages') loop
      if jsonb_typeof(n)<>'number' or n::text !~ '^[1-9][0-9]{0,5}$' or n::text::integer=any(seen) then return null; end if;
      select * into pg from public.workbook_pages where workbook_id=w.id and parent_id=w.parent_id and page_number=n::text::integer;
      if not found or pg.day_label is distinct from 'Day '||(d->>'day') or pg.page_type in ('cover','how-plan','back-cover','blank')
        or not exists(select 1 from public.workbook_questions where page_id=pg.id and parent_id=w.parent_id) then return null; end if;
      seen:=array_append(seen,n::text::integer);
      if d->'day'='7'::jsonb then required:=array_append(required,pg.id); day7:=d->'pages'; end if;
    end loop;
  end loop;
  if cardinality(required)=0 then return null; end if;
  if w.print_manifest->'testWorkbook'='true'::jsonb then
    if w.print_manifest->'levelTest'->'day' is distinct from '7'::jsonb
      or w.print_manifest->'levelTest'->'pages' is distinct from day7 then return null; end if;
  elsif w.print_manifest->'levelTest' is distinct from 'null'::jsonb then return null; end if;
  return required;
end $$;

-- Private clock argument permits deterministic local boundary probes. Only wrappers and hooks call it live.
create function public._claim_workbook_scan_trigger(p_book uuid,p_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.workbooks; r public.workbook_delivery_receipts; correction public.workbook_delivery_corrections;
  held public.workbook_scan_trigger_claims; required uuid[]; receipts uuid[]; deadline timestamptz; reason text; delivered timestamptz; audit bigint;
begin
  w:=public._lock_workbook_scan_book(p_book);
  p_at:=coalesce(p_at,clock_timestamp());
  if w.id is null or w.status<>'shipped' or w.printed_revision is null then return jsonb_build_object('status','unavailable'); end if;
  select * into held from public.workbook_scan_trigger_claims where workbook_id=w.id;
  required:=public._workbook_scan_day7(w.id);
  if required is null then return jsonb_build_object('status','unavailable'); end if;
  select * into r from public.workbook_delivery_receipts where workbook_id=w.id and parent_id=w.parent_id and child_id=w.child_id and number=w.number;
  if not found then return jsonb_build_object('status','missing-delivery'); end if;
  select * into correction from public.workbook_delivery_corrections where workbook_id=w.id order by audit_id desc limit 1;
  delivered:=coalesce(correction.delivered_at,r.delivered_at); audit:=coalesce(correction.audit_id,r.audit_id);
  insert into public.workbook_scan_clock_requests(delivery_audit_id,workbook_id,parent_id,child_id,number,printed_revision,
    delivery_correction_id,delivered_at,time_zone,zone_override)
    values(audit,w.id,w.parent_id,w.child_id,w.number,w.printed_revision,correction.id,delivered,r.time_zone,r.zone_override)
    on conflict(delivery_audit_id) do nothing;
  if held.id is not null then return jsonb_build_object('status','claimed','claim',to_jsonb(held)); end if;
  if delivered>p_at then return jsonb_build_object('status','waiting'); end if;
  select backstop_at into deadline from public.workbook_scan_delivery_calendars where delivery_audit_id=audit;
  select array_agg(id order by accepted_at,id) into receipts from public.workbook_scan_receipts
    where workbook_id=w.id and printed_revision=w.printed_revision and accepted_at<=p_at;
  if not exists(select 1 from unnest(required) page where not exists(select 1 from public.workbook_scan_receipts s
    where s.workbook_id=w.id and s.printed_revision=w.printed_revision and s.page_id=page and s.accepted_at<=p_at)) then
    reason:='day7_scanned';
  elsif deadline is null then
    return jsonb_build_object('status','clock-required','deliveryAuditId',audit);
  elsif p_at>=deadline then
    if receipts is null then
      insert into public.workbook_scan_backstop_holds(workbook_id,parent_id,child_id,printed_revision,delivery_audit_id,delivered_at,backstop_at)
        values(w.id,w.parent_id,w.child_id,w.printed_revision,audit,delivered,deadline) on conflict do nothing;
      return jsonb_build_object('status','hold','reason','no-accepted-scans-at-backstop','backstopAt',deadline);
    end if;
    reason:='delivery_backstop';
  else return jsonb_build_object('status','waiting','backstopAt',deadline); end if;
  insert into public.workbook_scan_trigger_claims(workbook_id,parent_id,child_id,number,printed_revision,reason,effective_at,
    delivery_audit_id,delivery_correction_id,delivered_at,time_zone,zone_override,backstop_at,receipt_ids)
    values(w.id,w.parent_id,w.child_id,w.number,w.printed_revision,reason,case when reason='delivery_backstop' then deadline else p_at end,
      audit,correction.id,delivered,r.time_zone,r.zone_override,deadline,receipts) returning * into held;
  return jsonb_build_object('status','claimed','claim',to_jsonb(held));
end $$;

-- Bounded recovery read. Obsolete corrections cannot fill a batch forever. The write still compares identity
-- under the book gate because a correction can commit immediately after this snapshot.
create function public.list_workbook_scan_clock_requests(p_limit integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare answer jsonb;
begin
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_scan_clock_batch'; end if;
  select coalesce(jsonb_agg(to_jsonb(pending) order by pending.delivery_audit_id),'[]'::jsonb) into answer
  from (
    select q.* from public.workbook_scan_clock_requests q
    join public.workbook_delivery_receipts r on r.workbook_id=q.workbook_id
    join public.workbooks w on w.id=q.workbook_id
    join public.parents p on p.id=q.parent_id
    where q.delivery_audit_id=coalesce((select max(c.audit_id) from public.workbook_delivery_corrections c where c.workbook_id=q.workbook_id),r.audit_id)
      and w.status='shipped' and w.printed_revision=q.printed_revision and p.deletion_requested_at is null
      and not exists(select 1 from public.child_deletions d where d.child_id=q.child_id)
      and not exists(select 1 from public.workbook_scan_delivery_calendars calendar where calendar.delivery_audit_id=q.delivery_audit_id)
    order by q.delivery_audit_id limit p_limit
  ) pending;
  return answer;
end $$;

-- Service-only adapter. Compute p_backstop with deliveryDeadlines on the server from the saved request.
-- p_clock_version identifies the reviewed application/runtime clock. It is evidence, not a client option.
-- The effective audit and its complete clock identity must still match after the per-book lock wait.
create function public.record_workbook_scan_delivery_calendar(p_book uuid,p_delivery_audit bigint,
  p_delivered timestamptz,p_zone text,p_override boolean,p_backstop timestamptz,p_clock_version text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.workbooks; r public.workbook_delivery_receipts; c public.workbook_delivery_corrections;
  calendar public.workbook_scan_delivery_calendars; audit bigint; delivered timestamptz;
begin
  w:=public._lock_workbook_scan_book(p_book);
  if w.id is null or w.status<>'shipped' or w.printed_revision is null then return jsonb_build_object('status','unavailable'); end if;
  select * into r from public.workbook_delivery_receipts where workbook_id=w.id and parent_id=w.parent_id and child_id=w.child_id and number=w.number;
  if not found then return jsonb_build_object('status','missing-delivery'); end if;
  select * into c from public.workbook_delivery_corrections where workbook_id=w.id order by audit_id desc limit 1;
  audit:=coalesce(c.audit_id,r.audit_id); delivered:=coalesce(c.delivered_at,r.delivered_at);
  if (p_delivery_audit,p_delivered,p_zone,p_override) is distinct from (audit,delivered,r.time_zone,r.zone_override) then
    return jsonb_build_object('status','stale-delivery'); end if;
  if p_backstop is null or not isfinite(p_backstop) or p_backstop<=delivered
    or date_trunc('minute',p_backstop)<>p_backstop or p_clock_version is null or char_length(p_clock_version) not between 1 and 200 then
    raise exception 'invalid_scan_calendar'; end if;
  -- Also creates the durable request for deliveries that predate this migration. Day 7 remains immediate.
  perform public._claim_workbook_scan_trigger(w.id,null);
  select * into calendar from public.workbook_scan_delivery_calendars where delivery_audit_id=audit;
  if found then
    if calendar.backstop_at<>p_backstop or calendar.clock_version<>p_clock_version then
      return jsonb_build_object('status','calendar-conflict'); end if;
  else
    insert into public.workbook_scan_delivery_calendars(delivery_audit_id,parent_id,child_id,backstop_at,clock_version)
      values(audit,w.parent_id,w.child_id,p_backstop,p_clock_version);
  end if;
  -- Re-read the database clock after all locks. Recover the decision even if no new scan or scheduler arrives.
  return public._claim_workbook_scan_trigger(w.id,null);
end $$;

create function public._admit_workbook_scan_receipt(p_photo uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare s public.scan_photos; c public.scan_calibrations; w public.workbooks; p public.workbook_pages; receipt uuid; at_time timestamptz;
begin
  -- The transition's RPC already owns photo then calibration. Keep that order for the common helper too.
  select * into s from public.scan_photos where id=p_photo for update;
  if not found then return null; end if;
  perform public.assert_family_writable(s.parent_id);
  select * into c from public.scan_calibrations where photo_id=s.id for share;
  if not found then return null; end if;
  w:=public._lock_workbook_scan_book(s.workbook_id);
  at_time:=clock_timestamp();
  if w.id is null or s.created_at<(select installed_at from public.workbook_scan_receipt_epoch)
    or s.state<>'saved' or s.terminal_at is not null or s.expires_at<=at_time or s.stored_bytes<=0 or s.width<=0 or s.height<=0
    or w.status<>'shipped' or w.parent_id<>s.parent_id or w.child_id<>s.child_id or w.number<1
    or w.printed_revision is distinct from s.printed_revision or s.printed_revision !~ '^[0-9a-f]{28}$'
    or c.state<>'ready' or c.parent_id<>s.parent_id or c.printed_revision<>s.printed_revision
    or not public.scan_marking_sheet_current(c.result)
    or c.result->'calibration'->>'revision' is distinct from s.printed_revision
    or c.result->'calibration'->'version' is distinct from '1'::jsonb
    or jsonb_typeof(c.result->'parts') is distinct from 'array' then return null; end if;
  select * into p from public.workbook_pages where id=s.page_id and workbook_id=w.id and parent_id=s.parent_id;
  if not found or p.print_contract is null or p.print_contract->'version' is distinct from '1'::jsonb
    or p.print_contract->>'workbookId' is distinct from w.id::text or p.print_contract->'page' is distinct from to_jsonb(p.page_number)
    or p.page_type in ('cover','how-plan','back-cover','blank')
    or not exists(select 1 from public.workbook_questions where page_id=p.id and parent_id=s.parent_id)
    or public._workbook_scan_day7(w.id) is null then return null; end if;
  if not c.result->'parts' @> '["straight"]'::jsonb or jsonb_array_length(c.result->'parts')>201
    or exists(select 1 from jsonb_array_elements(c.result->'parts') x where jsonb_typeof(x)<>'string' or (x#>>'{}') !~ '^(straight|crop-[0-9]{1,3})$') then return null; end if;
  -- Metadata proves recorded durable bytes, not just a promised object name. All parts belong to this calibration lease.
  if not exists(select 1 from storage.objects where bucket_id='scan-photos' and name=s.parent_id::text||'/'||s.id::text||'/photo.jpg'
    and metadata->>'size' ~ '^[1-9][0-9]{0,8}$' and metadata->>'mimetype'='image/jpeg')
    or exists(select 1 from jsonb_array_elements_text(c.result->'parts') part where not exists(select 1 from storage.objects o
      where o.bucket_id='scan-photos' and o.name=s.parent_id::text||'/'||s.id::text||'/'||c.lease_token::text||'-'||part.value||'.jpg'
      and o.metadata->>'size' ~ '^[1-9][0-9]{0,8}$' and o.metadata->>'mimetype'='image/jpeg')) then return null; end if;
  select id into receipt from public.workbook_scan_receipts where photo_revision=s.id;
  if receipt is not null then return receipt; end if;
  insert into public.workbook_scan_receipts(parent_id,child_id,workbook_id,number,printed_revision,page_id,photo_revision,calibration_token,accepted_at)
    values(s.parent_id,s.child_id,w.id,w.number,w.printed_revision,p.id,s.id,c.lease_token,at_time) returning id into receipt;
  -- Only a later accepted photo of this exact canonical page can resolve previous pending work.
  if exists(select 1 from public.workbook_scan_receipts r where r.workbook_id=w.id and r.printed_revision=w.printed_revision
    and r.page_id=p.id and r.accepted_at<at_time and r.id<>receipt) then
    insert into public.workbook_scan_pending_items(receipt_id,item_row_id,parent_id,child_id,item_id,result_version,expected)
      select receipt,m.id,m.parent_id,m.child_id,m.item_id,m.result_version,m.expected from public.scan_marking_items m
      where m.parent_id=s.parent_id and m.child_id=s.child_id and m.workbook_id=w.id and m.printed_revision=w.printed_revision
        and m.page_id=p.id and m.observation->>'state' in ('pending','parent-pending');
  end if;
  perform public._claim_workbook_scan_trigger(w.id,null);
  return receipt;
end $$;

create function public.capture_workbook_scan_receipt() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='scan_photos' then
    if new.state='saved' then perform public._admit_workbook_scan_receipt(new.id); end if;
  elsif new.state='ready' then perform public._admit_workbook_scan_receipt(new.photo_id); end if;
  return new;
end $$;
create trigger capture_scan_receipt after insert or update of state on public.scan_photos
  for each row execute function public.capture_workbook_scan_receipt();
create trigger capture_scan_receipt after insert or update of state,result on public.scan_calibrations
  for each row execute function public.capture_workbook_scan_receipt();

-- Capture OLD.owner_photo before S4 publication or S5 clears it. S5 can also resolve a retained retake reading.
create function public.capture_workbook_scan_resolution() returns trigger
language plpgsql security definer set search_path='' as $$
declare photo text; r public.workbook_scan_receipts; pending public.workbook_scan_pending_items;
begin
  if old.observation->>'state' not in ('pending','parent-pending') or new.observation->>'state' not in ('scored','parent-checked')
    or new.result_version<>old.result_version+1 or new.expected is distinct from old.expected
    or new.observation->'mastery' is distinct from old.observation->'mastery'
    or new.observation->'teaching' is distinct from old.observation->'teaching'
    or (new.parent_id,new.child_id,new.workbook_id,new.printed_revision,new.page_id,new.item_id)
      is distinct from (old.parent_id,old.child_id,old.workbook_id,old.printed_revision,old.page_id,old.item_id)
    or new.observation->>'result' not in ('right','wrong','blank') then return new; end if;
  photo:=coalesce(old.owner_photo::text,old.observation->'evidence'->>'photoRevision');
  if photo is null or new.observation->'evidence'->>'photoRevision' is distinct from photo then return new; end if;
  select * into r from public.workbook_scan_receipts where photo_revision::text=photo and parent_id=new.parent_id and child_id=new.child_id
    and workbook_id=new.workbook_id and printed_revision=new.printed_revision and page_id=new.page_id;
  if not found then return new; end if;
  select * into pending from public.workbook_scan_pending_items where receipt_id=r.id and item_row_id=old.id
    and result_version<=old.result_version and expected=old.expected;
  if not found then return new; end if;
  insert into public.workbook_scan_progress_events(receipt_id,item_row_id,parent_id,child_id,workbook_id,printed_revision,page_id,item_id,from_version,to_version)
    values(r.id,new.id,new.parent_id,new.child_id,new.workbook_id,new.printed_revision,new.page_id,new.item_id,old.result_version,new.result_version)
    on conflict(receipt_id,item_row_id) do nothing;
  return new;
end $$;
create trigger capture_scan_resolution after update on public.scan_marking_items
  for each row execute function public.capture_workbook_scan_resolution();

create function public.recheck_workbook_scan_delivery() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform public._claim_workbook_scan_trigger(new.workbook_id,null); return new; end $$;
create trigger recheck_scan_delivery after insert on public.workbook_delivery_receipts
  for each row execute function public.recheck_workbook_scan_delivery();
create trigger recheck_scan_delivery after insert on public.workbook_delivery_corrections
  for each row execute function public.recheck_workbook_scan_delivery();

create function public.reconcile_workbook_scan_progress(p_books uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare book uuid; answer jsonb:='[]';
begin
  if p_books is null or cardinality(p_books)>100 or array_position(p_books,null) is not null then raise exception 'invalid_scan_batch'; end if;
  -- Stable order for a bounded batch. Each book uses the same gate as acceptance and delivery.
  for book in select distinct x from unnest(p_books) x order by x loop
    answer:=answer||jsonb_build_array(jsonb_build_object('workbookId',book,'result',public._claim_workbook_scan_trigger(book,null)));
  end loop;
  return answer;
end $$;
create function public.admin_reconcile_workbook_scan_progress(p_books uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  return public.reconcile_workbook_scan_progress(p_books);
end $$;

do $$ declare f regprocedure; begin
  for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in
    ('immutable_workbook_scan_fact','record_workbook_scan_delivery_calendar','list_workbook_scan_clock_requests',
     '_lock_workbook_scan_book','_workbook_scan_day7','_claim_workbook_scan_trigger','_admit_workbook_scan_receipt',
     'capture_workbook_scan_receipt','capture_workbook_scan_resolution','recheck_workbook_scan_delivery',
     'reconcile_workbook_scan_progress','admin_reconcile_workbook_scan_progress') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
  end loop;
end $$;
grant execute on function public.reconcile_workbook_scan_progress(uuid[]) to service_role;
grant execute on function public.admin_reconcile_workbook_scan_progress(uuid[]) to authenticated;
grant execute on function public.record_workbook_scan_delivery_calendar(uuid,bigint,timestamptz,text,boolean,timestamptz,text) to service_role;
grant execute on function public.list_workbook_scan_clock_requests(integer) to service_role;
