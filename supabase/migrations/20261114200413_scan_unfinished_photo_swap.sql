-- Scan edge sweep review (2026-11-14, L2): a new photo of a page whose sent photo looked unfinished (its marking job
-- ended `unfinished`: every answer blank, nothing marked) replaces that photo only once the new photo is stored. Until
-- now the upload route deleted the old photo before the new one was stored, so a refused or lost upload left the page
-- with no photo. Additive: one new service-only function; identify_scan_photo and finish_scan_photo are unchanged.
--
-- replace_unfinished_scan_photo does identify and finish in one transaction, under the family write fence and the
-- scan: family lock, as those two do: the new photo must be processing with a live lease and its object stored; the
-- page's current photo must be this family's, saved, sent, of the same printing, with a finished `unfinished` job.
-- Then the old photo is deleted and the new one is bound to the page and stored (pending). Any other case answers
-- without changing anything: `duplicate` (the old photo stays), `page`, or `refused`.
create or replace function public.replace_unfinished_scan_photo(p_parent uuid, p_id uuid, p_token text, p_width integer, p_height integer, p_bytes bigint)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare r public.scan_photos; old public.scan_photos; pg record; rev text;
begin
  perform public.assert_family_writable(p_parent);
  perform pg_advisory_xact_lock(hashtextextended('scan:' || p_parent::text,0));
  select * into r from public.scan_photos where id=p_id and parent_id=p_parent for update;
  if not found or r.state<>'processing' or r.lease_until<=now() or r.expires_at<=now() or r.page_id is not null
    or p_bytes is null or p_bytes<1 or p_bytes>r.reserved_bytes then return 'refused'; end if;
  select p.id,p.workbook_id,w.child_id,w.approved_at,w.printed_at,w.printed_revision into pg
    from public.workbook_pages p join public.workbooks w on w.id=p.workbook_id and w.parent_id=p_parent
    join public.children c on c.id=w.child_id and c.parent_id=p_parent
    where p.qr_token=p_token and p.parent_id=p_parent and w.status='shipped'
    order by (w.child_id=r.child_id) desc limit 1;
  if not found then return 'page'; end if;
  rev := coalesce(pg.printed_revision,coalesce(pg.printed_at,pg.approved_at)::text);
  select * into old from public.scan_photos where page_id=pg.id and state in ('processing','pending','saved') for update;
  if not found or old.parent_id<>p_parent or old.state<>'saved' or old.sent_at is null or old.printed_revision is distinct from rev
    or not exists(select 1 from public.scan_marking_jobs j where j.photo_id=old.id and j.state='finished' and j.blocked_reason='unfinished')
    then return 'duplicate'; end if;
  if not exists(select 1 from storage.objects where bucket_id='scan-photos' and name=p_parent::text||'/'||p_id::text||'/photo.jpg') then return 'refused'; end if;
  update public.scan_photos set state='deleted',terminal_at=now() where id=old.id;
  update public.scan_photos set page_id=pg.id,workbook_id=pg.workbook_id,child_id=pg.child_id,printed_revision=rev,
    width=p_width,height=p_height,state='pending',stored_bytes=p_bytes,reserved_bytes=0 where id=p_id;
  return 'pending';
end $function$;

revoke all on function public.replace_unfinished_scan_photo(uuid,uuid,text,integer,integer,bigint) from public,anon,authenticated;
grant execute on function public.replace_unfinished_scan_photo(uuid,uuid,text,integer,integer,bigint) to service_role;
