-- #726: the recovery run drains several waiting photos, the oldest sent first.
-- Additive. `recover_scan_marking` (order of photo ids) and `public.scan_marking_cursor` stay as they are, so the
-- deployed code keeps working until the new code ships; after that they have no caller and can go in a later
-- migration. This adds a second cursor and `recover_scan_marking_oldest`, which walks the same list of photos with
-- work to do (the same conditions as `recover_scan_marking` in 20261106_scan_marking_sheet_check.sql), in the order of
-- `sent_at`, then `id`.
--
-- The cursor is a keyset (after_sent_at, after_id). Each call locks the cursor row, so two runs at once get different
-- photos. When the list ends the call answers [] and sets the cursor back to the start; the caller
-- (`recoverScanMarking`) then asks once more in the same run, so the restart does not waste the run.
-- The function only chooses photos: the claim, the lease and the token in `scan_marking_command`, the family's slot,
-- and the budget stay where they are.

create table if not exists public.scan_marking_queue_cursor(
  singleton boolean primary key default true check (singleton),
  after_sent_at timestamptz,
  after_id uuid,
  check ((after_sent_at is null) = (after_id is null))
);
insert into public.scan_marking_queue_cursor default values on conflict do nothing;
alter table public.scan_marking_queue_cursor enable row level security;
revoke all on public.scan_marking_queue_cursor from public, anon, authenticated, service_role;

create index if not exists scan_photos_sent_order on public.scan_photos (sent_at, id) where sent_at is not null;

create or replace function public.recover_scan_marking_oldest(p_limit int default 1) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cursor_sent timestamptz; cursor_id uuid; answer jsonb; last_sent timestamptz; last_id uuid;
begin
  if p_limit not between 1 and 10 then raise exception 'marking_limit'; end if;
  select after_sent_at, after_id into cursor_sent, cursor_id from public.scan_marking_queue_cursor where singleton for update;
  select coalesce(jsonb_agg(jsonb_build_object('photo', b.photo, 'parent', b.parent, 'child', b.child) order by b.sent_at, b.photo), '[]'),
    (array_agg(b.sent_at order by b.sent_at desc, b.photo desc))[1], (array_agg(b.photo order by b.sent_at desc, b.photo desc))[1]
    into answer, last_sent, last_id
  from (
    select p.id as photo, p.parent_id as parent, p.child_id as child, p.sent_at from public.scan_photos p
      join public.parents f on f.id=p.parent_id and f.deletion_requested_at is null
      left join public.scan_marking_jobs j on j.photo_id=p.id
      left join public.scan_marking_revisions r on r.child_id=p.child_id
    where p.sent_at is not null and (cursor_id is null or (p.sent_at, p.id) > (cursor_sent, cursor_id))
      and not exists(select 1 from public.child_deletions d where d.child_id=p.child_id)
      and ((public.scan_photo_is_active(p.state,p.created_at,p.expires_at) and p.state='saved' and coalesce(j.state,'queued')<>'finished'
          and exists(select 1 from public.scan_calibrations c where c.photo_id=p.id and c.parent_id=p.parent_id
            and c.printed_revision=p.printed_revision and c.state='ready' and public.scan_marking_sheet_current(c.result)))
        or r.profile_revision<r.revision
        or exists(select 1 from public.scan_marking_items m where m.parent_id=p.parent_id and m.child_id=p.child_id
          and m.original_event is not null and m.event_id is null))
      order by p.sent_at, p.id limit p_limit
  ) b;
  -- An empty answer sets the cursor back to the start (both columns null).
  update public.scan_marking_queue_cursor set after_sent_at=last_sent, after_id=last_id where singleton;
  return answer;
end $$;
revoke all on function public.recover_scan_marking_oldest(int) from public, anon, authenticated;
grant execute on function public.recover_scan_marking_oldest(int) to service_role;
