-- Hosted rollback probe for 20261114193803_scan_edge_limits_and_blank_pages (scan edge sweep, 2026-11-14).
-- Always ends in an exception, so nothing it does is kept. Expected message: the claim's item_versions hold only the
-- page's AI blanks; after apply the blank read as Right is Right at version +1, the blank read with no written text is
-- still blank at its version, other items are unchanged; pause 'unfinished' gives job finished/unfinished, owned_after=0.
do $$
declare ph uuid; p uuid; s public.scan_photos; j public.scan_marking_jobs; t uuid := gen_random_uuid();
  items jsonb; claimed jsonb; obs jsonb; evs jsonb; r1 jsonb; r2 jsonb; before jsonb; after jsonb; blanks uuid[]; applied jsonb; paused jsonb; jobafter text;
begin
  -- A test family's sent, active photo with a ready current check, whose page has at least two AI blanks.
  select x.id into ph from public.scan_photos x join public.test_accounts a on a.parent_id=x.parent_id
    join public.scan_calibrations c on c.photo_id=x.id and c.state='ready' and c.printed_revision=x.printed_revision
    where x.state='saved' and x.sent_at is not null and x.expires_at>now() and public.scan_marking_sheet_current(c.result)
      and (select count(*) from public.scan_marking_items i where i.page_id=x.page_id and i.printed_revision=x.printed_revision
        and i.observation->>'result'='blank' and i.observation->>'actor'='system')>=2
    order by x.sent_at desc limit 1;
  if ph is null then raise exception 'PROBE no photo'; end if;
  select * into s from public.scan_photos where id=ph; p := s.parent_id;
  select * into j from public.scan_marking_jobs where photo_id=ph;
  update public.scan_marking_jobs set state='queued', lease_until=null, lease_token=null, extraction=null, blocked_reason=null where photo_id=ph;
  select array_agg(id order by item_id) into blanks from public.scan_marking_items where page_id=s.page_id and printed_revision=s.printed_revision and observation->>'result'='blank';
  select jsonb_object_agg(item_id, jsonb_build_object('r',observation->>'result','v',result_version,'a',observation->>'actor')) into before from public.scan_marking_items where page_id=s.page_id and printed_revision=s.printed_revision;
  select jsonb_agg(jsonb_build_object('expected',expected,'observation',observation||jsonb_build_object('resultVersion',1)) order by (expected->>'number')::int) into items from public.scan_marking_items where page_id=s.page_id and printed_revision=s.printed_revision;
  claimed := public.scan_marking_automatic_command('claim', p, ph, t, jsonb_build_object('hash', j.frame_hash, 'items', items));
  if jsonb_typeof(claimed)<>'object' then raise exception 'PROBE claim=%', claimed; end if;
  select item_versions into r1 from public.scan_marking_jobs where photo_id=ph;
  -- First blank: a later reading says Right. Second blank: a reading with no written text. Others: as they are.
  select jsonb_agg(case when i.id=blanks[1] then i.observation||jsonb_build_object('result','right','state','scored')
    when i.id=blanks[2] then i.observation||jsonb_build_object('result',null,'state','pending','certainty','uncertain','issue','blurry','regions','[]'::jsonb)
    else i.observation end) into obs
    from public.scan_marking_items i where i.page_id=s.page_id and i.printed_revision=s.printed_revision;
  select jsonb_agg(jsonb_build_object('key','marking:'||encode(sha256(convert_to(i.workbook_id::text||':'||i.printed_revision||':'||i.page_id::text||':'||i.item_id,'UTF8')),'hex'))) into evs
    from public.scan_marking_items i where i.page_id=s.page_id and i.printed_revision=s.printed_revision;
  perform public.scan_marking_automatic_command('extract', p, ph, t, jsonb_build_object('observations', obs, 'model', 'anthropic/claude-sonnet-5.5', 'prompt', 'probe'));
  applied := public.scan_marking_automatic_command('apply', p, ph, t, jsonb_build_object('events', evs, 'at', now()));
  select jsonb_object_agg(item_id, jsonb_build_object('r',observation->>'result','v',result_version)) into after from public.scan_marking_items where page_id=s.page_id and printed_revision=s.printed_revision;
  paused := public.scan_marking_automatic_command('pause', p, ph, t, jsonb_build_object('status','unfinished'));
  select state||'/'||blocked_reason into jobafter from public.scan_marking_jobs where photo_id=ph;
  raise exception 'PROBE claimedVersions=% before=% applied=% after=% paused=% job=% owned_after=%', r1, before, applied, after, paused, jobafter,
    (select count(*) from public.scan_marking_items where owner_photo=ph);
end $$;
