-- B14 probe (item 7): run on the linked database. It changes one test-family photo inside a block that always raises,
-- so nothing is kept. Before migration scan_photo_save_window: late_save=saved active=false. After: late_save=refused.
do $$ declare ph public.scan_photos; r text := ''; begin
select p.* into ph from public.scan_photos p join public.test_accounts t on t.parent_id = p.parent_id
  where p.page_id is not null and p.printed_revision is not null and p.width > 0 and p.height > 0
  and not exists (select 1 from public.family_deletions d where d.parent_id = p.parent_id) limit 1;
if ph.id is null then raise exception 'PROBE: no test-family photo'; end if;
-- 23 h 45 min old and pending: past the 23.5 h window the site uses everywhere else.
update public.scan_photos set state = 'pending', created_at = now() - interval '23 hours 45 minutes', expires_at = now() + interval '1 hour' where id = ph.id;
r := r || ' late_save=' || public.change_scan_photo(ph.parent_id, ph.id, 'save') || ' active=' || public.scan_photo_is_active('pending', now() - interval '23 hours 45 minutes', now() + interval '1 hour');
-- 23 h old and pending: inside the window.
update public.scan_photos set state = 'pending', created_at = now() - interval '23 hours' where id = ph.id;
r := r || ' inside_save=' || public.change_scan_photo(ph.parent_id, ph.id, 'save');
raise exception 'PROBE (rolled back):%', r; end $$
