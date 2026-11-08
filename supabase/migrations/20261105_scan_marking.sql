-- S4. Additive and closed by default. No price is enabled and no family release is opened.
-- Budget units are integer millionths of USD. Anonymous spend holds survive child/family deletion.
-- Family-owned jobs, readings, event intents and context cascade through child AND family deletion.
create table public.scan_marking_prices (
  model text primary key,
  maximum_micros bigint check (maximum_micros between 1 and 50000000),
  max_tokens int not null default 4096 check (max_tokens = 4096),
  max_pixels bigint not null default 48000000 check (max_pixels between 1 and 48000000),
  verified_at timestamptz,
  evidence text,
  enabled boolean not null default false,
  check (not enabled or (maximum_micros is not null and verified_at is not null and length(evidence)>0))
);
insert into public.scan_marking_prices(model) values ('anthropic/claude-sonnet-5.5'), ('anthropic/claude-haiku-5.5');
create table public.scan_marking_jobs (
  photo_id uuid primary key references public.scan_photos(id) on delete cascade,
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null,
  workbook_id uuid not null,
  page_id uuid not null,
  printed_revision text not null,
  state text not null default 'queued' check (state in ('queued','running','extracted','finished')),
  lease_token uuid,
  lease_until timestamptz,
  dispatches int not null default 0 check (dispatches between 0 and 2),
  frame_hash text not null,
  item_versions jsonb not null default '{}',
  extraction jsonb,
  model text,
  prompt text,
  blocked_reason text check (blocked_reason in ('off','budget','price-unverified','attempts','pending')),
  created_at timestamptz not null default now(),
  foreign key (child_id,parent_id) references public.children(id,parent_id) on delete cascade,
  foreign key (page_id,workbook_id,parent_id) references public.workbook_pages(id,workbook_id,parent_id) on delete cascade
);
create index scan_marking_jobs_family on public.scan_marking_jobs(parent_id, state);
create table public.scan_marking_items (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null,
  workbook_id uuid not null,
  printed_revision text not null,
  page_id uuid not null,
  item_id text not null,
  expected jsonb not null,
  observation jsonb not null,
  result_version int not null default 1 check (result_version >= 1),
  owner_photo uuid,
  original_event jsonb,
  event_id uuid references public.learning_events(id) on delete set null,
  evidence_at timestamptz not null default now(),
  model text,
  prompt text,
  unique (workbook_id,printed_revision,page_id,item_id),
  foreign key (child_id,parent_id) references public.children(id,parent_id) on delete cascade,
  foreign key (page_id,workbook_id,parent_id) references public.workbook_pages(id,workbook_id,parent_id) on delete cascade,
  check (jsonb_typeof(expected)='object' and jsonb_typeof(observation)='object'),
  check (length(observation->>'readAnswerText') <= 200),
  check ((observation->>'resultVersion')::int = result_version),
  check (observation->>'state' in ('pending','scored','parent-pending','parent-checked','unscored')),
  check (observation->>'result' is null or observation->>'result' in ('right','wrong','blank'))
);
create index scan_marking_items_child on public.scan_marking_items(child_id,id);
create table public.scan_marking_revisions (
  child_id uuid primary key,
  parent_id uuid not null references public.parents(id) on delete cascade,
  revision bigint not null default 0,
  foreign key (child_id,parent_id) references public.children(id,parent_id) on delete cascade
);
-- Contains no user, child, workbook, photo, job, provider request id, text or file path.
create table public.scan_marking_spend (
  id uuid primary key default gen_random_uuid(),
  period date not null,
  model text not null references public.scan_marking_prices(model),
  reserved_micros bigint not null check (reserved_micros between 1 and 50000000),
  charged_micros bigint check (charged_micros >= 0 and charged_micros <= reserved_micros),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
-- The family-owned dispatch link is deleted with its job. The anonymous charge hold remains reconcilable.
create table public.scan_marking_dispatches (
  id uuid primary key references public.scan_marking_spend(id),
  photo_id uuid not null references public.scan_marking_jobs(photo_id) on delete cascade,
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null,
  attempt int not null check (attempt between 1 and 2),
  unique (photo_id,attempt),
  foreign key (child_id,parent_id) references public.children(id,parent_id) on delete cascade
);
do $$ declare t text; begin
  foreach t in array array['scan_marking_prices','scan_marking_jobs','scan_marking_items','scan_marking_revisions','scan_marking_spend','scan_marking_dispatches'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role',t);
    execute format('grant select on public.%I to service_role',t);
  end loop;
  foreach t in array array['scan_marking_jobs','scan_marking_items','scan_marking_revisions','scan_marking_dispatches'] loop
    execute format('create trigger fence_family_write before insert or update on public.%I for each row execute function public.fence_family_write()',t);
    execute format('create trigger fence_child_delete_write before insert or update on public.%I for each row execute function public.fence_child_delete_write()',t);
  end loop;
end $$;

-- Every processing stage takes the same scan-family lock before it counts these leases.
create function public.scan_active_jobs(p_parent uuid) returns bigint
language sql stable set search_path = '' as $$
  select (select count(*) from public.scan_photos p where p.parent_id=p_parent and p.state='processing'
      and p.lease_until>clock_timestamp() and p.expires_at>clock_timestamp())
    + (select count(*) from public.scan_calibrations c join public.scan_photos p on p.id=c.photo_id
      where c.parent_id=p_parent and c.state='running' and c.lease_until>clock_timestamp()
      and p.expires_at>clock_timestamp() and public.scan_photo_is_active(p.state,p.created_at,p.expires_at))
    + (select count(*) from public.scan_marking_jobs j join public.scan_photos p on p.id=j.photo_id
      where j.parent_id=p_parent and j.state in ('running','extracted') and j.lease_until>clock_timestamp()
      and p.expires_at>clock_timestamp() and public.scan_photo_is_active(p.state,p.created_at,p.expires_at));
$$;
revoke all on function public.scan_active_jobs(uuid) from public,anon,authenticated,service_role;

-- One command boundary keeps all mutations service-only and lock order explicit:
-- parent share lock, scan family lock, photo row, job row, canonical item rows, global budget lock.
create function public.scan_marking_command(p_action text, p_parent uuid, p_photo uuid, p_token uuid, p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.scan_photos; j public.scan_marking_jobs; m public.scan_marking_items;
  price public.scan_marking_prices; lim public.scan_limits;
  b record; c public.scan_calibrations; e jsonb; o jsonb; ev jsonb; vals jsonb; n int; held bigint; dispatch uuid;
  child uuid; budget_period date; after_id uuid; active_count int; queued_count int;
begin
  -- No child data is read or restored by settlement, including after the owning family is gone.
  if p_action='settle' then
    if p_parent is not null or p_photo is not null or p_token is null then return 'false'; end if;
    if p_data->>'cost' is null then return 'true'; end if;
    held := (p_data->>'cost')::bigint;
    if held < 0 then return 'false'; end if;
    update public.scan_marking_spend set charged_micros=held, settled_at=now()
      where id=p_token and charged_micros is null and held<=reserved_micros;
    -- No lower second report can free an already reconciled charge. Over-bound reports retain the hold.
    return to_jsonb(found or exists(select 1 from public.scan_marking_spend where id=p_token and charged_micros=held));
  end if;
  perform public.assert_family_writable(p_parent);
  if p_action in ('effective','outbox','ack','revision') then
    child := (p_data->>'child')::uuid;
    if not exists(select 1 from public.children where id=child and parent_id=p_parent)
      or exists(select 1 from public.child_deletions where child_id=child) then return 'null'; end if;
    if p_action='revision' then
      return to_jsonb(coalesce((select revision from public.scan_marking_revisions where child_id=child),0));
    end if;
    if p_action='ack' then
      perform pg_advisory_xact_lock(hashtextextended('scan:'||p_parent::text,0));
      update public.scan_marking_items set event_id=(p_data->>'event')::uuid where id=(p_data->>'item')::uuid and child_id=child and parent_id=p_parent and event_id is null
        and exists(select 1 from public.learning_events l where l.id=(p_data->>'event')::uuid and l.parent_id=p_parent and l.child_id=child and l.idempotency_key=original_event->>'key');
      if found then update public.scan_marking_revisions set revision=revision+1 where child_id=child; return 'true'; end if;
      return to_jsonb(exists(select 1 from public.scan_marking_items where id=(p_data->>'item')::uuid and child_id=child and parent_id=p_parent and event_id=(p_data->>'event')::uuid));
    end if;
    after_id := coalesce((p_data->>'after')::uuid,'00000000-0000-0000-0000-000000000000');
    select coalesce(jsonb_agg(to_jsonb(rows) order by rows.id),'[]') into vals from (
      select * from public.scan_marking_items where parent_id=p_parent and child_id=child and id>after_id
        and (p_action='effective' or (original_event is not null and event_id is null)) order by id limit 100
    ) rows;
    return vals;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:'||p_parent::text,0));
  select * into s from public.scan_photos where id=p_photo and parent_id=p_parent for update;
  if not found then return '"terminal"'; end if;
  if exists(select 1 from public.child_deletions where child_id=s.child_id) then return '"terminal"'; end if;
  if p_action='detail' then
    return jsonb_build_object('job',(select to_jsonb(x) from public.scan_marking_jobs x where photo_id=p_photo),
      'dispatches',(select coalesce(jsonb_agg(jsonb_build_object('attempt',d.attempt,'period',x.period,'reservedMicros',x.reserved_micros,'chargedMicros',x.charged_micros)),'[]') from public.scan_marking_dispatches d join public.scan_marking_spend x on x.id=d.id where d.photo_id=p_photo),
      'active',public.scan_photo_is_active(s.state,s.created_at,s.expires_at));
  end if;
  if s.expires_at<=clock_timestamp() or not public.scan_photo_is_active(s.state,s.created_at,s.expires_at) or s.state<>'saved' or s.sent_at is null then return '"terminal"'; end if;
  select w.printed_revision,p.print_contract,p.page_number,p.image_width,p.image_height,p.image_path into b
    from public.workbook_pages p join public.workbooks w on w.id=p.workbook_id
    where p.id=s.page_id and p.workbook_id=s.workbook_id and p.parent_id=p_parent and w.child_id=s.child_id and w.status='shipped';
  select * into c from public.scan_calibrations where photo_id=p_photo and parent_id=p_parent;
  if b.printed_revision is null or b.print_contract is null or b.printed_revision<>s.printed_revision
    or c.state is distinct from 'ready' or c.printed_revision<>s.printed_revision then return '"unavailable"'; end if;
  if p_action='frame' then
    return jsonb_build_object('photo',to_jsonb(s),'page',to_jsonb(b),'calibration',to_jsonb(c),'questions',
      (select coalesce(jsonb_agg(to_jsonb(q) order by question_number),'[]') from public.workbook_questions q where page_id=s.page_id and parent_id=p_parent));
  end if;
  select * into j from public.scan_marking_jobs where photo_id=p_photo for update;
  if p_action='claim' then
    select * into lim from public.scan_limits where singleton;
    select count(*) filter(where x.state='queued' or (x.state in ('running','extracted') and x.lease_until<=clock_timestamp())) into queued_count
      from public.scan_marking_jobs x join public.scan_photos p on p.id=x.photo_id
      where x.parent_id=p_parent and x.photo_id<>p_photo and public.scan_photo_is_active(p.state,p.created_at,p.expires_at);
    active_count := public.scan_active_jobs(p_parent);
    if j.photo_id is null then
      if active_count+queued_count >= lim.active_jobs+lim.queued_jobs then return '"busy"'; end if;
      insert into public.scan_marking_jobs(photo_id,parent_id,child_id,workbook_id,page_id,printed_revision,frame_hash)
        values(p_photo,p_parent,s.child_id,s.workbook_id,s.page_id,s.printed_revision,p_data->>'hash') returning * into j;
    end if;
    if j.frame_hash is distinct from p_data->>'hash' then return '"unavailable"'; end if;
    if j.state='finished' then
      -- Publication and profile recovery are independent and run before the worker claims another request.
      return '"unavailable"';
    end if;
    if j.lease_until>clock_timestamp() or active_count>=lim.active_jobs then return '"busy"'; end if;
    if jsonb_typeof(p_data->'items') is distinct from 'array' or jsonb_array_length(p_data->'items')=0
      or jsonb_array_length(p_data->'items')<> (select count(*) from public.workbook_questions where page_id=s.page_id and parent_id=p_parent) then return '"unavailable"'; end if;
    for e in select value from jsonb_array_elements(p_data->'items') loop
      if e->'expected'->'identity'->>'workbookId'<>s.workbook_id::text or e->'expected'->'identity'->>'printedRevision'<>s.printed_revision
        or e->'expected'->'identity'->>'pageId'<>s.page_id::text or not exists(select 1 from public.workbook_questions q where q.page_id=s.page_id
          and q.question_number=(e->'expected'->>'number')::int and coalesce(q.package->>'id','question-'||q.question_number::text)=e->'expected'->'identity'->>'itemId') then return '"unavailable"'; end if;
      insert into public.scan_marking_items(parent_id,child_id,workbook_id,printed_revision,page_id,item_id,expected,observation)
        values(p_parent,s.child_id,s.workbook_id,s.printed_revision,s.page_id,e->'expected'->'identity'->>'itemId',e->'expected',e->'observation') on conflict(workbook_id,printed_revision,page_id,item_id) do nothing;
    end loop;
    -- Claims only pending originals. Parent-pending and unscored rows already have explicit initial observations.
    update public.scan_marking_items set owner_photo=p_photo where workbook_id=s.workbook_id and page_id=s.page_id and printed_revision=s.printed_revision and observation->>'state'='pending';
    select coalesce(jsonb_object_agg(id::text,result_version),'{}') into vals from public.scan_marking_items where owner_photo=p_photo and page_id=s.page_id and observation->>'state'='pending';
    update public.scan_marking_jobs set state=case when extraction is null then 'running' else 'extracted' end,lease_token=p_token,lease_until=clock_timestamp()+interval '180 seconds',item_versions=vals,blocked_reason=null where photo_id=p_photo;
    return jsonb_build_object('token',p_token,'extraction',j.extraction,'items',(select jsonb_agg(to_jsonb(x) order by x.item_id) from public.scan_marking_items x where page_id=s.page_id and printed_revision=s.printed_revision));
  end if;
  if j.photo_id is null or j.lease_token is distinct from p_token or j.lease_until<=clock_timestamp() or j.state not in ('running','extracted') then return '"terminal"'; end if;
  if p_action='admit' then
    if j.extraction is not null then return '"attempts"'; end if;
    if j.dispatches>=2 then return '"attempts"'; end if;
    select * into price from public.scan_marking_prices where model=p_data->>'model' and enabled;
    if not found or price.maximum_micros is null or price.verified_at is null or price.max_pixels < b.image_width::bigint*b.image_height::bigint then return '"price-unverified"'; end if;
    -- A cheaper model cannot enter the production path without a separate approved comparison.
    if price.model <> 'anthropic/claude-sonnet-5.5' and p_data->>'evaluation' is distinct from 'approved-fixed-set' then return '"price-unverified"'; end if;
    perform pg_advisory_xact_lock(hashtextextended('scan-marking-global-budget',0));
    -- Time can cross either deadline while the global ledger lock is held elsewhere.
    -- The photo and job row locks preserve their values, but they cannot preserve time.
    if s.expires_at<=clock_timestamp() or not public.scan_photo_is_active(s.state,s.created_at,s.expires_at)
      or s.state<>'saved' or s.sent_at is null or j.lease_token is distinct from p_token
      or j.lease_until<=clock_timestamp() or j.state not in ('running','extracted') then return '"terminal"'; end if;
    budget_period := date_trunc('month',clock_timestamp() at time zone 'UTC')::date;
    select coalesce(sum(coalesce(charged_micros,reserved_micros)),0) into held from public.scan_marking_spend where scan_marking_spend.period=budget_period;
    if held+price.maximum_micros>50000000 then return '"budget"'; end if;
    insert into public.scan_marking_spend(period,model,reserved_micros) values(budget_period,price.model,price.maximum_micros) returning id into dispatch;
    insert into public.scan_marking_dispatches(id,photo_id,parent_id,child_id,attempt) values(dispatch,p_photo,p_parent,s.child_id,j.dispatches+1);
    update public.scan_marking_jobs set dispatches=dispatches+1 where photo_id=p_photo;
    return jsonb_build_object('dispatch',dispatch);
  elsif p_action='extract' then
    if j.extraction is null then
      if jsonb_typeof(p_data->'observations') is distinct from 'array' or jsonb_array_length(p_data->'observations')>200 then return 'false'; end if;
      update public.scan_marking_jobs set extraction=p_data->'observations',model=p_data->>'model',prompt=p_data->>'prompt',state='extracted' where photo_id=p_photo;
    end if;
    return 'true';
  elsif p_action='apply' then
    if j.extraction is null then return 'false'; end if;
    for o in select value from jsonb_array_elements(j.extraction) loop
      select * into m from public.scan_marking_items where page_id=s.page_id and printed_revision=s.printed_revision and item_id=o->'identity'->>'itemId' for update;
      if not found or m.owner_photo is distinct from p_photo or m.result_version is distinct from (j.item_versions->>m.id::text)::int or m.observation->>'state'<>'pending' then continue; end if;
      if o->'identity' is distinct from m.expected->'identity' then raise exception 'marking_identity'; end if;
      ev := null;
      if m.expected->'mastery'->>'eligible'='true' and o->>'state'='scored' then
        select value into ev from jsonb_array_elements(p_data->'events') where value->>'key'='marking:'||encode(sha256(convert_to(s.workbook_id::text||':'||s.printed_revision||':'||s.page_id::text||':'||m.item_id,'UTF8')),'hex');
        if ev is null then raise exception 'marking_event_missing'; end if;
      end if;
      update public.scan_marking_items set observation=jsonb_set(o,'{resultVersion}',to_jsonb(m.result_version+1)),result_version=m.result_version+1,
        original_event=coalesce(original_event,ev),evidence_at=(p_data->>'at')::timestamptz,model=j.model,prompt=j.prompt,owner_photo=null where id=m.id;
    end loop;
    insert into public.scan_marking_revisions(child_id,parent_id,revision) values(s.child_id,p_parent,1) on conflict(child_id) do update set revision=scan_marking_revisions.revision+1;
    return 'true';
  elsif p_action='pause' then
    if p_data->>'status' in ('off','budget','price-unverified','attempts','pending') then
      update public.scan_marking_jobs set state=case when p_data->>'status'='attempts' then 'finished' else 'queued' end, blocked_reason=p_data->>'status',lease_until=null where photo_id=p_photo;
    end if;
    return 'true';
  elsif p_action='finish' then
    update public.scan_marking_jobs set state='finished',lease_until=null where photo_id=p_photo;
    return 'true';
  end if;
  return 'null';
end $$;
revoke all on function public.scan_marking_command(text,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.scan_marking_command(text,uuid,uuid,uuid,jsonb) to service_role;

-- Profile builds must read and save the same effective marking revision, including a first-ever profile build.
alter table public.scan_marking_revisions add column profile_revision bigint not null default -1;
create function public.save_marked_child_profile(p_child uuid,p_parent uuid,p_marking_revision bigint,p_assessment uuid,p_expected uuid,p_schema_version smallint,p_profile jsonb,p_changes jsonb,p_tests uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare answer jsonb;
begin
  perform public.assert_family_writable(p_parent);
  perform pg_advisory_xact_lock(hashtextextended('scan:'||p_parent::text,0));
  if not exists(select 1 from public.children where id=p_child and parent_id=p_parent)
    or exists(select 1 from public.child_deletions where child_id=p_child) then raise exception 'child_unavailable' using errcode='55000'; end if;
  insert into public.scan_marking_revisions(child_id,parent_id) values(p_child,p_parent) on conflict(child_id) do nothing;
  perform 1 from public.scan_marking_revisions where child_id=p_child and parent_id=p_parent and revision=p_marking_revision for update;
  if not found then return null; end if;
  answer := public.save_child_profile_and_skill_changes_from_tests(p_child,p_parent,p_assessment,p_expected,p_schema_version,p_profile,p_changes,p_tests);
  if answer is not null then update public.scan_marking_revisions set profile_revision=p_marking_revision where child_id=p_child; end if;
  return answer;
exception when unique_violation then return null;
end $$;
revoke all on function public.save_marked_child_profile(uuid,uuid,bigint,uuid,uuid,smallint,jsonb,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function public.save_marked_child_profile(uuid,uuid,bigint,uuid,uuid,smallint,jsonb,jsonb,uuid[]) to service_role;

-- Keep the save-only upload path from filling an unlimited future marking queue. Existing admission still owns
-- frequency, total bytes and concurrent uploads. Counts include accepted but not yet sent photos and uploads.
create or replace function public.admit_scan_photo(p_parent uuid,p_child uuid,p_id uuid,p_bytes bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare l public.scan_limits; r public.scan_photos; n int; b bigint;
begin
  perform public.assert_family_writable(p_parent);
  perform pg_advisory_xact_lock(hashtextextended('scan:' || p_parent::text,0));
  select * into l from public.scan_limits where singleton;
  select * into r from public.scan_photos where id=p_id;
  if found then
    if r.parent_id=p_parent and r.child_id=p_child then return r.state; end if;
    return 'refused';
  end if;
  if p_bytes is null or p_bytes < 1 or p_bytes > l.input_bytes then return 'size'; end if;
  if not exists(select 1 from public.workbooks where parent_id=p_parent and child_id=p_child and status='shipped') then return 'page'; end if;
  select count(*) into n from public.scan_photos where parent_id=p_parent and created_at>now()-interval '10 minutes';
  if n>=l.per_ten_minutes then return 'frequency'; end if;
  select count(*) into n from public.scan_photos where parent_id=p_parent and created_at>now()-interval '1 day';
  if n>=l.per_day then return 'frequency'; end if;
  select count(*) into n from public.scan_photos where parent_id=p_parent and state in ('reserved','processing') and lease_until>now();
  if n>=l.concurrent_uploads or n>=l.active_jobs+l.queued_jobs then return 'busy'; end if;
  select count(*) into n from public.scan_photos p where p.parent_id=p_parent
    and p.state in ('reserved','processing','pending','saved') and p.expires_at>now()
    and not exists(select 1 from public.scan_marking_jobs j where j.photo_id=p.id and j.state='finished');
  if n>=l.active_jobs+l.queued_jobs then return 'busy'; end if;
  select coalesce(sum(reserved_bytes+stored_bytes),0) into b from public.scan_photos where parent_id=p_parent;
  if b+l.output_bytes>l.family_bytes then return 'quota'; end if;
  insert into public.scan_photos(id,parent_id,child_id,reserved_bytes) values(p_id,p_parent,p_child,l.output_bytes);
  return 'reserved';
end $$;

-- A global keyset cursor prevents one refused photo from starving later sent photos. Contains no family reference.
create table public.scan_marking_cursor(singleton boolean primary key default true check(singleton),after_id uuid);
insert into public.scan_marking_cursor default values;
alter table public.scan_marking_cursor enable row level security;
revoke all on public.scan_marking_cursor from public,anon,authenticated,service_role;
create function public.recover_scan_marking(p_limit int default 5) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cursor_id uuid; answer jsonb; last_id uuid;
begin
  if p_limit not between 1 and 10 then raise exception 'marking_limit'; end if;
  select after_id into cursor_id from public.scan_marking_cursor where singleton for update;
  select coalesce(jsonb_agg(to_jsonb(batch) order by batch.photo),'[]') into answer from (
    select p.id as photo,p.parent_id as parent,p.child_id as child from public.scan_photos p
      join public.parents f on f.id=p.parent_id and f.deletion_requested_at is null
      left join public.scan_marking_jobs j on j.photo_id=p.id
      left join public.scan_marking_revisions r on r.child_id=p.child_id
    where p.sent_at is not null and p.id>coalesce(cursor_id,'00000000-0000-0000-0000-000000000000')
      and not exists(select 1 from public.child_deletions d where d.child_id=p.child_id)
      and ((public.scan_photo_is_active(p.state,p.created_at,p.expires_at) and p.state='saved' and coalesce(j.state,'queued')<>'finished')
        or r.profile_revision<r.revision
        or exists(select 1 from public.scan_marking_items m where m.parent_id=p.parent_id and m.child_id=p.child_id
          and m.original_event is not null and m.event_id is null))
      order by p.id limit p_limit
  ) batch;
  select (v->>'photo')::uuid into last_id from jsonb_array_elements(answer) with ordinality a(v,n) order by n desc limit 1;
  update public.scan_marking_cursor set after_id=last_id where singleton;
  return answer;
end $$;
revoke all on function public.recover_scan_marking(int) from public,anon,authenticated;
grant execute on function public.recover_scan_marking(int) to service_role;

-- A pending one-child deletion also removes session image access before physical cleanup finishes.
create function public.scan_child_images_live(p_child uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.children c join public.parents p on p.id=c.parent_id
    where c.id=p_child and p.deletion_requested_at is null
      and (c.parent_id=(select auth.uid()) or (select public.is_admin())))
    and not exists(select 1 from public.child_deletions where child_id=p_child);
$$;
revoke all on function public.scan_child_images_live(uuid) from public,anon;
grant execute on function public.scan_child_images_live(uuid) to authenticated,service_role;
create policy scan_child_image_fence on public.scan_photos as restrictive for select to authenticated
  using (public.scan_child_images_live(child_id));

-- Normalization, calibration and marking share the same family processing slot.
create or replace function public.start_scan_photo(p_parent uuid,p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare r public.scan_photos; l public.scan_limits; n int;
begin
  perform public.assert_family_writable(p_parent);
  perform pg_advisory_xact_lock(hashtextextended('scan:' || p_parent::text,0));
  select * into r from public.scan_photos where id=p_id and parent_id=p_parent for update;
  if not found then return 'refused'; end if;
  if r.state<>'reserved' then return r.state; end if;
  if r.lease_until<=clock_timestamp() or r.expires_at<=clock_timestamp() then return 'expired'; end if;
  select * into l from public.scan_limits where singleton;
  n := public.scan_active_jobs(p_parent);
  if n>=l.active_jobs then return 'busy'; end if;
  update public.scan_photos set state='processing' where id=p_id;
  return 'started';
end $$;

create or replace function public.begin_scan_calibration(p_parent uuid, p_id uuid, p_token uuid, p_lease_seconds int default 90) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.scan_photos; c public.scan_calibrations; b record; l public.scan_limits;
begin
  perform public.assert_family_writable(p_parent);
  perform pg_advisory_xact_lock(hashtextextended('scan:'||p_parent::text,0));
  select * into r from public.scan_photos where id=p_id and parent_id=p_parent for update;
  if not found then return jsonb_build_object('status','unknown'); end if;
  if r.expires_at<=clock_timestamp() or not public.scan_photo_is_active(r.state,r.created_at,r.expires_at) then return jsonb_build_object('status','terminal'); end if;
  select w.printed_revision,p.print_contract is not null as has_contract into b
    from public.workbook_pages p join public.workbooks w on w.id=p.workbook_id where p.id=r.page_id and p.parent_id=p_parent;
  if not found or b.printed_revision is null or not b.has_contract then return jsonb_build_object('status','unavailable','reason','no-contract'); end if;
  if r.printed_revision is distinct from b.printed_revision then return jsonb_build_object('status','unavailable','reason','other-revision'); end if;
  select * into c from public.scan_calibrations where photo_id=p_id for update;
  if found then
    if c.state<>'running' then return jsonb_build_object('status',c.state); end if;
    if c.lease_until>clock_timestamp() then return jsonb_build_object('status','busy'); end if;
    if c.attempts>=5 then
      update public.scan_calibrations set state='refused',result=jsonb_build_object('reason','failed'),finished_at=clock_timestamp() where photo_id=p_id;
      return jsonb_build_object('status','refused');
    end if;
  end if;
  select * into l from public.scan_limits where singleton;
  if public.scan_active_jobs(p_parent)>=l.active_jobs then return jsonb_build_object('status','busy'); end if;
  if c.photo_id is null then
    insert into public.scan_calibrations(photo_id,parent_id,printed_revision,state,lease_token,lease_until)
      values(p_id,p_parent,r.printed_revision,'running',p_token,clock_timestamp()+make_interval(secs=>p_lease_seconds));
  else
    update public.scan_calibrations set lease_token=p_token,lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),attempts=attempts+1 where photo_id=p_id;
  end if;
  return jsonb_build_object('status','started');
end $$;
