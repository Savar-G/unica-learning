-- Hosted rollback probe for 20261114200413_scan_unfinished_photo_swap (scan edge sweep review, L2). Always ends in an
-- exception, so nothing it does is kept. Expected: marked=duplicate (a marked page keeps its photo),
-- unstored=refused (an unfinished page keeps its photo while the new one is not stored), old_state=saved.
do $$
declare p uuid; c uuid; old uuid; tok text; n uuid := gen_random_uuid(); a text; b text; st text;
begin
  select s.parent_id, s.child_id, s.id, wp.qr_token into p, c, old, tok from public.scan_photos s join public.test_accounts t on t.parent_id=s.parent_id
    join public.workbook_pages wp on wp.id=s.page_id
    join public.scan_marking_jobs j on j.photo_id=s.id and j.state='finished' and j.blocked_reason is null
    where s.state='saved' and s.sent_at is not null and s.expires_at>now() order by s.sent_at desc limit 1;
  if old is null then raise exception 'PROBE no photo'; end if;
  update public.scan_limits set per_day=100000, per_ten_minutes=100000, concurrent_uploads=100, active_jobs=100, queued_jobs=100 where singleton;
  if public.admit_scan_photo_v2(p,c,n,1) <> 'reserved' or public.start_scan_photo(p,n) <> 'started' then raise exception 'PROBE no reservation'; end if;
  a := public.replace_unfinished_scan_photo(p,n,tok,10,10,1);
  update public.scan_marking_jobs set blocked_reason='unfinished' where photo_id=old;
  b := public.replace_unfinished_scan_photo(p,n,tok,10,10,1);
  select state into st from public.scan_photos where id=old;
  raise exception 'PROBE marked=% unstored=% old_state=%', a, b, st;
end $$;
