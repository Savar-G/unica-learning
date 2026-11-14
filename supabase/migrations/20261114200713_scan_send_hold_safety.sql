-- Review of PR #981 (scan edge sweep #3, #4): the server's hold and the photo swap, made safe under the family lock.
-- 1. Undo sticks: unhold_scan_photos writes send_undone_at (even for a page not held yet, so an Undo that arrives before
--    its hold wins), and hold_scan_photos skips such a page. due_scan_sends leaves it out.
-- 2. send_due_scan_photos sends only rows that still match the due rule under the family lock, so an Undo that lands
--    between the due read and the send is respected.
-- 3. release_scan_holds lets go of a hold without the Undo mark (the phone dropped a page, or swaps its photo), so the
--    page can be held again later. defer_scan_sends moves a due page that cannot send now an hour forward, so it does
--    not push newer due pages out of the recovery run's limit.
-- 4. replace_ready_scan_photo deletes a page's photo for a new photo of it only while that photo is saved, unsent,
--    active, not in marking, and checked on its own printing, all under the family lock.
-- Additive: one nullable column and new functions; the three functions from 20261114193254 keep their signatures.

alter table public.scan_photos add column if not exists send_undone_at timestamptz;

create or replace function public.hold_scan_photos(p_parent uuid, p_ids uuid[], p_seconds integer)
 returns uuid[]
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare held uuid[];
begin
  perform public.assert_family_writable(p_parent);
  if p_ids is null or cardinality(p_ids) = 0 then return '{}'; end if;
  if cardinality(p_ids) > 200 then raise exception 'too_many_pages'; end if;
  if p_seconds is null or p_seconds < 1 or p_seconds > 600 then raise exception 'bad_hold'; end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:' || p_parent::text, 0));
  with h as (
    update public.scan_photos s set send_after = now() + make_interval(secs => p_seconds)
      where s.parent_id = p_parent and s.id = any(p_ids) and s.sent_at is null and s.state = 'saved'
        and s.send_undone_at is null
        and public.scan_photo_is_active(s.state, s.created_at, s.expires_at)
      returning s.id)
  select coalesce(array_agg(id order by id), '{}') into held from h;
  return held;
end $function$;

-- Undo: never sent on its own again, whatever hold arrives later. Returns the unsent pages it covers; a page missing
-- from the answer was already sent.
create or replace function public.unhold_scan_photos(p_parent uuid, p_ids uuid[])
 returns uuid[]
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare gone uuid[];
begin
  perform public.assert_family_writable(p_parent);
  if p_ids is null or cardinality(p_ids) = 0 then return '{}'; end if;
  if cardinality(p_ids) > 200 then raise exception 'too_many_pages'; end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:' || p_parent::text, 0));
  with u as (
    update public.scan_photos s set send_after = null, send_undone_at = coalesce(s.send_undone_at, now())
      where s.parent_id = p_parent and s.id = any(p_ids) and s.sent_at is null
      returning s.id)
  select coalesce(array_agg(id order by id), '{}') into gone from u;
  return gone;
end $function$;

-- Lets go of a hold with no Undo mark: the page may be held again.
create or replace function public.release_scan_holds(p_parent uuid, p_ids uuid[])
 returns uuid[]
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare gone uuid[];
begin
  perform public.assert_family_writable(p_parent);
  if p_ids is null or cardinality(p_ids) = 0 then return '{}'; end if;
  if cardinality(p_ids) > 200 then raise exception 'too_many_pages'; end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:' || p_parent::text, 0));
  with u as (
    update public.scan_photos s set send_after = null
      where s.parent_id = p_parent and s.id = any(p_ids) and s.send_after is not null and s.sent_at is null
      returning s.id)
  select coalesce(array_agg(id order by id), '{}') into gone from u;
  return gone;
end $function$;

create or replace function public.due_scan_sends(p_parent uuid, p_limit integer)
 returns table(id uuid, parent_id uuid, child_id uuid)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select s.id, s.parent_id, s.child_id
    from public.scan_photos s
    join public.scan_calibrations c on c.photo_id = s.id and c.parent_id = s.parent_id
    where s.send_after is not null and s.sent_at is null and s.send_after <= now() and s.send_undone_at is null
      and (p_parent is null or s.parent_id = p_parent)
      and s.state = 'saved' and public.scan_photo_is_active(s.state, s.created_at, s.expires_at)
      and c.state = 'ready' and c.printed_revision = s.printed_revision
      and jsonb_typeof(c.result->'sheetCheck') = 'number' and (c.result->>'sheetCheck')::numeric >= 1
      and coalesce(s.photo_check->>'state', '') <> 'pending'
      and not (coalesce(s.photo_check->>'state', '') = 'done' and coalesce(s.photo_check->>'problem', '') <> '')
    order by s.send_after, s.id
    limit greatest(1, least(coalesce(p_limit, 100), 200));
$function$;

-- The server's send of held pages: under the family lock, only rows of this child that still match the due rule.
-- Returns the ids it sent now.
create or replace function public.send_due_scan_photos(p_parent uuid, p_child uuid, p_ids uuid[])
 returns uuid[]
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare sent uuid[];
begin
  perform public.assert_family_writable(p_parent);
  if p_ids is null or cardinality(p_ids) = 0 then return '{}'; end if;
  if cardinality(p_ids) > 200 then raise exception 'too_many_pages'; end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:' || p_parent::text, 0));
  perform 1 from public.scan_photos where parent_id = p_parent and id = any(p_ids) order by id for update;
  with u as (
    update public.scan_photos s set sent_at = now()
      from public.scan_calibrations c
      where s.parent_id = p_parent and s.child_id = p_child and s.id = any(p_ids)
        and s.sent_at is null and s.send_after is not null and s.send_after <= now() and s.send_undone_at is null
        and s.state = 'saved' and public.scan_photo_is_active(s.state, s.created_at, s.expires_at)
        and c.photo_id = s.id and c.parent_id = s.parent_id and c.state = 'ready' and c.printed_revision = s.printed_revision
        and jsonb_typeof(c.result->'sheetCheck') = 'number' and (c.result->>'sheetCheck')::numeric >= 1
        and coalesce(s.photo_check->>'state', '') <> 'pending'
        and not (coalesce(s.photo_check->>'state', '') = 'done' and coalesce(s.photo_check->>'problem', '') <> '')
      returning s.id)
  select coalesce(array_agg(id order by id), '{}') into sent from u;
  return sent;
end $function$;

-- A due page that cannot be sent now (a plan paused or unreadable, a family being deleted) waits p_seconds more.
create or replace function public.defer_scan_sends(p_parent uuid, p_ids uuid[], p_seconds integer)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare n integer;
begin
  if p_ids is null or cardinality(p_ids) = 0 then return 0; end if;
  if cardinality(p_ids) > 200 then raise exception 'too_many_pages'; end if;
  if p_seconds is null or p_seconds < 1 or p_seconds > 86400 then raise exception 'bad_hold'; end if;
  update public.scan_photos s set send_after = now() + make_interval(secs => p_seconds)
    where s.parent_id = p_parent and s.id = any(p_ids) and s.send_after is not null and s.sent_at is null;
  get diagnostics n = row_count;
  return n;
end $function$;

-- A page's photo goes for a new photo of that page only while it is saved, unsent, active, has no marking job, and its
-- check is not running and is of its own printing. 'deleted' or 'kept'. Storage is cleaned by the caller.
create or replace function public.replace_ready_scan_photo(p_parent uuid, p_old uuid, p_page uuid)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare r public.scan_photos; c record;
begin
  perform public.assert_family_writable(p_parent);
  perform pg_advisory_xact_lock(hashtextextended('scan:' || p_parent::text, 0));
  select * into r from public.scan_photos where id = p_old and parent_id = p_parent and page_id = p_page for update;
  if not found or r.state <> 'saved' or r.sent_at is not null or not public.scan_photo_is_active(r.state, r.created_at, r.expires_at) then return 'kept'; end if;
  if exists(select 1 from public.scan_marking_jobs j where j.photo_id = p_old and j.parent_id = p_parent) then return 'kept'; end if;
  select state, printed_revision into c from public.scan_calibrations where photo_id = p_old and parent_id = p_parent;
  if not found or c.state = 'running' or c.printed_revision is distinct from r.printed_revision then return 'kept'; end if;
  update public.scan_photos set state = 'deleted', terminal_at = now(), send_after = null where id = p_old;
  return 'deleted';
end $function$;

revoke all on function public.hold_scan_photos(uuid, uuid[], integer) from public, anon, authenticated;
grant execute on function public.hold_scan_photos(uuid, uuid[], integer) to service_role;
revoke all on function public.unhold_scan_photos(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.unhold_scan_photos(uuid, uuid[]) to service_role;
revoke all on function public.release_scan_holds(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.release_scan_holds(uuid, uuid[]) to service_role;
revoke all on function public.due_scan_sends(uuid, integer) from public, anon, authenticated;
grant execute on function public.due_scan_sends(uuid, integer) to service_role;
revoke all on function public.send_due_scan_photos(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.send_due_scan_photos(uuid, uuid, uuid[]) to service_role;
revoke all on function public.defer_scan_sends(uuid, uuid[], integer) from public, anon, authenticated;
grant execute on function public.defer_scan_sends(uuid, uuid[], integer) to service_role;
revoke all on function public.replace_ready_scan_photo(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.replace_ready_scan_photo(uuid, uuid, uuid) to service_role;
