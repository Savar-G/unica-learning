-- #915 scan flow: a page photo is filed to whichever child of the family its printed code belongs to.
-- Before, a code from a sibling's book answered 'page' ("not in this child's workbook") and the parent had to switch
-- child and take the photo again. Now the code decides: the page must still be a page of one of this family's shipped
-- workbooks (parent_id on the page and the workbook join), and the photo moves to that workbook's child. Nothing crosses
-- families: the page and the photo are both read under p_parent, and scan_photos' foreign key (child_id, parent_id)
-- refuses any child of another family. A child being deleted refuses the update through fence_child_delete_write.
-- Everything else is unchanged: the family write fence, the family lock, the photo's state and lease, the duplicate
-- rule per page and the printed revision. Additive: same signature and return values, so the live site keeps working.
create or replace function public.identify_scan_photo(p_parent uuid, p_id uuid, p_token text, p_width integer, p_height integer)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare r public.scan_photos; pg record;
begin
  perform public.assert_family_writable(p_parent);
  perform pg_advisory_xact_lock(hashtextextended('scan:' || p_parent::text,0));
  select * into r from public.scan_photos where id=p_id and parent_id=p_parent for update;
  if not found or r.state<>'processing' or r.lease_until<=now() then return 'refused'; end if;
  -- The photo's own child first, so a code shared across books (never expected) keeps today's answer.
  select p.id,p.workbook_id,w.child_id,w.approved_at,w.printed_at,w.printed_revision into pg
    from public.workbook_pages p join public.workbooks w on w.id=p.workbook_id and w.parent_id=p_parent
    join public.children c on c.id=w.child_id and c.parent_id=p_parent
    where p.qr_token=p_token and p.parent_id=p_parent and w.status='shipped'
    order by (w.child_id=r.child_id) desc limit 1;
  if not found then return 'page'; end if;
  if exists(select 1 from public.scan_photos where page_id=pg.id and state in ('pending','saved')) then return 'duplicate'; end if;
  begin
    update public.scan_photos set page_id=pg.id,workbook_id=pg.workbook_id,child_id=pg.child_id,
      printed_revision=coalesce(pg.printed_revision,coalesce(pg.printed_at,pg.approved_at)::text),width=p_width,height=p_height where id=p_id;
  exception when unique_violation then return 'duplicate'; end;
  return 'identified';
end $function$;

revoke all on function public.identify_scan_photo(uuid,uuid,text,integer,integer) from public, anon, authenticated;
grant execute on function public.identify_scan_photo(uuid,uuid,text,integer,integer) to service_role;
