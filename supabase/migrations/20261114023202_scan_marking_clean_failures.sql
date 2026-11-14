-- #868: only a clean 429 of scan marking (OpenRouter's own error envelope, clean429-v1: no generation or usage at any
-- depth, and no reported cost) is exempt from a job's two dispatches. It never ran, so `settle` frees its hold (charge 0)
-- after the database checks the body again, and answers "clean". The run that meets one defers the job (queued, blocked
-- reason `pending`); a deferral is spent only when the job's latest dispatch is such a 429. After 3 deferrals the next
-- one sends the unread items to the team, as `attempts` does. A time-out, 408, 5xx or lost answer may have been charged:
-- it counts as a dispatch and keeps its full hold, exactly as before. At most 8 dispatches per job in all (2 counted and
-- up to 2 clean 429s, a 429 and its retry, per deferral), and at most 2 full holds kept per photo, plus the one dispatch
-- in flight before its settle. Additive: the deployed site sends no `failure`
-- to `settle` and never calls `defer`, so its calls answer and count exactly as before.
alter table public.scan_marking_dispatches add column clean_failure text
  check (clean_failure in ('rate-limit'));
alter table public.scan_marking_jobs add column deferrals int not null default 0 check (deferrals between 0 and 3);
alter table public.scan_marking_jobs drop constraint scan_marking_jobs_dispatches_check,
  add constraint scan_marking_jobs_dispatches_check check (dispatches between 0 and 8);
alter table public.scan_marking_dispatches drop constraint scan_marking_dispatches_attempt_check,
  add constraint scan_marking_dispatches_attempt_check check (attempt between 1 and 8);

create or replace function public.scan_marking_automatic_command(p_action text, p_parent uuid, p_photo uuid, p_token uuid, p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.scan_photos; j public.scan_marking_jobs; m public.scan_marking_items;
  price public.scan_marking_prices; lim public.scan_limits;
  b record; c public.scan_calibrations; e jsonb; o jsonb; ev jsonb; vals jsonb; n int; held bigint; dispatch uuid;
  child uuid; budget_period date; after_id uuid; active_count int; queued_count int; st text; evidence jsonb;
begin
  -- No child data is read or restored by settlement, including after the owning family is gone.
  if p_action='settle' then
    if p_parent is not null or p_photo is not null or p_token is null then return 'false'; end if;
    if p_data->>'cost' is null then
      -- #868: a clean 429 with no cost. Anything this cannot check keeps today's rule: the full hold stays, the dispatch
      -- counts, and the answer is `true`. A cost always wins: it is settled below and never treated as clean.
      if p_data->>'failure' is distinct from 'rate-limit' or p_data->'status' is distinct from '429'::jsonb
        or jsonb_typeof(p_data->'body') is distinct from 'string' or length(p_data->>'body')>20000 then return 'true'; end if;
      -- The same rule as clean429-v1: OpenRouter's own 429 envelope, with no generation or usage at any depth. A body
      -- that cannot be read as JSON (a \u0000 escape, 22P05, or any other cast error) is not clean.
      begin
        evidence := (p_data->>'body')::jsonb;
        if jsonb_typeof(evidence) is distinct from 'object'
          or jsonb_typeof(evidence->'error') is distinct from 'object' or evidence->'error'->'code' is distinct from '429'::jsonb
          or jsonb_typeof(evidence->'error'->'message') is distinct from 'string' or length(evidence->'error'->>'message')=0
          or public.scan_marking_evaluation_has_generation(evidence) then return 'true'; end if;
      exception when others then return 'true';
      end;
      perform pg_advisory_xact_lock(hashtextextended('scan-marking-global-budget',0));
      -- Only a production dispatch whose charge is still unknown. After a family deletion the link is gone: the hold stays.
      update public.scan_marking_dispatches d set clean_failure='rate-limit'
        where d.id=p_token and d.clean_failure is null
          and exists(select 1 from public.scan_marking_spend x where x.id=d.id and x.charged_micros is null);
      if found then
        update public.scan_marking_spend set charged_micros=0,settled_at=now() where id=p_token and charged_micros is null;
      end if;
      -- "clean" only when this dispatch is recorded as a clean 429 with its hold freed (a repeat settle answers the same).
      if exists(select 1 from public.scan_marking_dispatches d join public.scan_marking_spend x on x.id=d.id
        where d.id=p_token and d.clean_failure='rate-limit' and x.charged_micros=0) then return '"clean"'; end if;
      return 'true';
    end if;
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
      'dispatches',(select coalesce(jsonb_agg(jsonb_build_object('attempt',d.attempt,'period',x.period,'reservedMicros',x.reserved_micros,'chargedMicros',x.charged_micros,'cleanFailure',d.clean_failure)),'[]') from public.scan_marking_dispatches d join public.scan_marking_spend x on x.id=d.id where d.photo_id=p_photo),
      'active',public.scan_photo_is_active(s.state,s.created_at,s.expires_at));
  end if;
  if s.expires_at<=clock_timestamp() or not public.scan_photo_is_active(s.state,s.created_at,s.expires_at) or s.state<>'saved' or s.sent_at is null then return '"terminal"'; end if;
  select w.printed_revision,p.print_contract,p.page_number,p.image_width,p.image_height,p.image_path into b
    from public.workbook_pages p join public.workbooks w on w.id=p.workbook_id
    where p.id=s.page_id and p.workbook_id=s.workbook_id and p.parent_id=p_parent and w.child_id=s.child_id and w.status='shipped';
  select * into c from public.scan_calibrations where photo_id=p_photo and parent_id=p_parent for share;
  if b.printed_revision is null or b.print_contract is null or b.printed_revision<>s.printed_revision
    or c.state is distinct from 'ready' or c.printed_revision<>s.printed_revision
    or not public.scan_marking_sheet_current(c.result) then return '"unavailable"'; end if;
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
    -- #868: only a clean 429 does not use up one of the two dispatches. Eight dispatches in all is the backstop.
    if j.dispatches-(select count(*) from public.scan_marking_dispatches d where d.photo_id=p_photo and d.clean_failure='rate-limit')>=2
      or j.dispatches>=8 then return '"attempts"'; end if;
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
  elsif p_action in ('pause','defer') then
    st := p_data->>'status';
    -- #868: a run that met a clean 429 waits as pending; after 3 deferrals the next one goes to the team. A deferral is
    -- spent only when the job's latest dispatch is a clean 429 recorded above; else the job is paused as pending.
    if p_action='defer' then
      if (select d.clean_failure from public.scan_marking_dispatches d where d.photo_id=p_photo order by d.attempt desc limit 1)
        is distinct from 'rate-limit' then st := 'pending';
      elsif j.deferrals>=3 then st := 'attempts';
      else st := 'pending'; update public.scan_marking_jobs set deferrals=deferrals+1 where photo_id=p_photo;
      end if;
    end if;
    if st in ('off','budget','price-unverified','attempts','pending') then
      if st='attempts' then
        update public.scan_marking_items set observation=observation||jsonb_build_object(
          'certainty','uncertain','issue','read-failed','resultVersion',result_version+1,
          'evidence',jsonb_build_object('photoRevision',p_photo::text)),
          result_version=result_version+1,owner_photo=null
        where owner_photo=p_photo and parent_id=p_parent and workbook_id=s.workbook_id and page_id=s.page_id
          and printed_revision=s.printed_revision and observation->>'result' is null
          and observation->>'state'='pending' and model is null
          and (observation->>'certainty'='not-read' or (observation->>'certainty'='uncertain'
            and observation->>'issue'='read-failed' and observation->>'readAnswerText' is null
            and observation->'regions'='[]'::jsonb));
      end if;
      update public.scan_marking_jobs set state=case when st='attempts' then 'finished' else 'queued' end, blocked_reason=st,lease_until=null where photo_id=p_photo;
    end if;
    if p_action='defer' then return to_jsonb(st); end if;
    return 'true';
  elsif p_action='finish' then
    update public.scan_marking_jobs set state='finished',lease_until=null where photo_id=p_photo;
    return 'true';
  end if;
  return 'null';
end $$;

-- #868: the history and monitor reads (the wrapper from 20261106_scan_page_history, unchanged otherwise). Each job
-- carries its own latest dispatch (clean failure and settle time); a monitor spend row carries `cleanFailure`, and a
-- clean 429 reads `deferred`, not `failed`, so admin costs keep throttling apart from marking failures. Additive: the
-- deployed reader ignores the new fields and keeps `deferred` as one more outcome label.
create or replace function public.scan_marking_command(p_action text,p_parent uuid,p_photo uuid,p_token uuid,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare answer jsonb; monitoring boolean;
begin
  if p_action not in ('history','monitor') then
    return public.scan_marking_saved_command(p_action,p_parent,p_photo,p_token,p_data);
  end if;
  monitoring:=p_action='monitor';
  if monitoring then
    if p_parent is not null or not exists(select 1 from public.admin_users where user_id=(p_data->>'admin')::uuid) then return 'null'; end if;
  else
    perform public.assert_family_writable(p_parent);
    if p_data->>'child' is null or not exists(select 1 from public.children where id=(p_data->>'child')::uuid and parent_id=p_parent)
      or exists(select 1 from public.child_deletions where child_id=(p_data->>'child')::uuid) then return 'null'; end if;
  end if;
  -- Each page, its canonical marks and all linked spend share one SQL statement snapshot.
  with pages as materialized (
    select p.id,p.workbook_id,p.page_number,p.day_label,w.printed_revision,w.number,w.child_id,c.first_name
    from public.workbook_pages p join public.workbooks w on w.id=p.workbook_id and w.parent_id=p.parent_id
      join public.children c on c.id=w.child_id and c.parent_id=w.parent_id
      join public.parents f on f.id=w.parent_id
    where w.status='shipped' and w.printed_revision is not null and p.day_label is not null
      and f.deletion_requested_at is null and not exists(select 1 from public.child_deletions d where d.child_id=c.id)
      and (monitoring or w.parent_id=p_parent)
      and (p_data->>'child' is null or w.child_id=(p_data->>'child')::uuid)
      and (p_data->>'workbook' is null or w.id=(p_data->>'workbook')::uuid)
      and p.id>coalesce((p_data->>'after')::uuid,'00000000-0000-0000-0000-000000000000')
    order by p.id limit 100
  ), records as (
    select p.id,p.workbook_id as "workbookId",p.number as book,p.child_id as "childId",p.first_name as "childName",
      p.printed_revision as revision,p.day_label as day,p.page_number as "pageNumber",
      (select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]') from public.scan_marking_items m
        where m.page_id=p.id and m.workbook_id=p.workbook_id and m.child_id=p.child_id and m.printed_revision=p.printed_revision) as marks,
      (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'state',s.state,'expiresAt',s.expires_at,'sentAt',s.sent_at,'at',s.created_at) order by s.created_at,s.id),'[]')
        from public.scan_photos s where s.page_id=p.id and s.workbook_id=p.workbook_id and s.child_id=p.child_id and s.printed_revision=p.printed_revision) as photos,
      (select coalesce(jsonb_agg(jsonb_build_object('photo',j.photo_id,'state',j.state,'blocked',j.blocked_reason,'dispatches',j.dispatches,
        -- #868: the job's own latest dispatch, so a deferral on a clean 429 is judged per job.
        'lastDispatch',(select jsonb_build_object('cleanFailure',d.clean_failure,'settledAt',x.settled_at) from public.scan_marking_dispatches d
          join public.scan_marking_spend x on x.id=d.id where d.photo_id=j.photo_id order by d.attempt desc limit 1)) order by j.photo_id),'[]')
        from public.scan_marking_jobs j where j.page_id=p.id and j.workbook_id=p.workbook_id and j.child_id=p.child_id and j.printed_revision=p.printed_revision) as jobs,
      case when monitoring then (select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'model',x.model,'at',x.created_at,'reserved',x.reserved_micros,'charged',x.charged_micros,'cleanFailure',d.clean_failure,'outcome',case when d.clean_failure is not null then 'deferred' when j.blocked_reason in ('pending','attempts') then 'failed' when exists(select 1 from jsonb_array_elements(case when jsonb_typeof(j.extraction)='array' then j.extraction else '[]'::jsonb end) o where o->>'state'='pending') then 'uncertain' when j.state='finished' then 'finished' else 'pending' end) order by x.id),'[]')
        from public.scan_marking_jobs j join public.scan_marking_dispatches d on d.photo_id=j.photo_id join public.scan_marking_spend x on x.id=d.id
        where j.page_id=p.id and j.workbook_id=p.workbook_id and j.child_id=p.child_id and j.printed_revision=p.printed_revision) else '[]'::jsonb end as spend
    from pages p
  ) select jsonb_build_object('pages',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from records r),
    'budget',case when monitoring then (select jsonb_build_object('period',date_trunc('month',now() at time zone 'UTC')::date,
      'cap',50000000,'reported',coalesce(sum(charged_micros),0),'held',coalesce(sum(coalesce(charged_micros,reserved_micros)),0),
      'unknown',count(*) filter(where charged_micros is null),'reserved',coalesce(sum(reserved_micros) filter(where charged_micros is null),0))
      from public.scan_marking_spend where period=date_trunc('month',now() at time zone 'UTC')::date) else null end) into answer;
  return answer;
end $$;
