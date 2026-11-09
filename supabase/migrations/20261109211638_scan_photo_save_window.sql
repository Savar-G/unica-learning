-- Item 7 of docs/state-machines.md, bug B14. A pending scan photo stays active for 23.5 hours: scan_photo_is_active,
-- expire_scan_photos and src/lib/scan-photo-active.ts all use that window. change_scan_photo still saved a pending photo
-- up to 24 hours old (migration 20261102_scan_page_photos), so in the last 30 minutes a parent could save a photo that
-- the rest of the site already treats as gone. 'save' now asks scan_photo_is_active, the one rule.
--
-- The body is the live definition with only the 'save' test changed. A saved photo that has not expired is active, so
-- saving it again answers 'saved' at any age (before: 'refused' after 24 hours). The signature, grants and
-- security definer stay the same; the code on main keeps working.
create or replace function public.change_scan_photo(p_parent uuid, p_id uuid, p_action text)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare r public.scan_photos;
begin
  perform public.assert_family_writable(p_parent);
  select * into r from public.scan_photos where id=p_id and parent_id=p_parent for update;
  if not found then return 'refused'; end if;
  if r.state in ('deleted','expired','rejected') then return r.state; end if;
  if p_action='save' and r.state in ('pending','saved') and public.scan_photo_is_active(r.state, r.created_at, r.expires_at) then
    update public.scan_photos set state='saved' where id=p_id; return 'saved';
  elsif p_action in ('delete','reject') then
    update public.scan_photos set state=case when p_action='delete' then 'deleted' else 'rejected' end,terminal_at=now() where id=p_id;
    return case when p_action='delete' then 'deleted' else 'rejected' end;
  end if;
  return 'refused';
end $function$;
