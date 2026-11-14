-- Scan edge sweep #3: the Undo's hold is kept on the server, so a page that passed is still sent when the parent leaves
-- Scan pages during its Undo (before, `pagehide` dropped the hold and nothing ever sent the page).
-- When the phone holds a page for the Undo it writes `send_after` (now plus the Undo's wait). Undo clears it. The server
-- sends the pages whose time has passed from the recovery run (/api/scan-marking, pg_cron scan-marking-recovery) and on
-- the parent's next load of Scan pages (docs/scan-pages.md, "Sending after Undo").
-- Additive: a new nullable column, a partial index and three new service-only functions. send_scan_photos is unchanged,
-- so the live site keeps working; a page sent by hand or by the phone simply never comes due.

alter table public.scan_photos add column if not exists send_after timestamptz;

create index if not exists scan_photos_send_after_idx on public.scan_photos (send_after)
  where send_after is not null and sent_at is null;

-- Holds the family's unsent saved photos for p_seconds from now (a new hold of a held page starts its wait again, as the
-- phone does). 1 to 600 seconds: the Undo's 10 s, or a longer hold while the capture screen is open. Returns the ids held.
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
        and public.scan_photo_is_active(s.state, s.created_at, s.expires_at)
      returning s.id)
  select coalesce(array_agg(id order by id), '{}') into held from h;
  return held;
end $function$;

-- Undo: the pages are no longer sent on their own. Returns the ids let go.
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
    update public.scan_photos s set send_after = null
      where s.parent_id = p_parent and s.id = any(p_ids) and s.send_after is not null and s.sent_at is null
      returning s.id)
  select coalesce(array_agg(id order by id), '{}') into gone from u;
  return gone;
end $function$;

-- The held pages whose time has passed and that Send would take now, by the database's clock: unsent, saved, active, with
-- a ready check of their own printing that passed the sheet check (send_scan_photos' own rule), and whose photo check
-- (#855) is not still running and found no problem, as the phone's automatic send decides. p_parent: one family, or null
-- for every family (the recovery run). Oldest hold first.
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
    where s.send_after is not null and s.sent_at is null and s.send_after <= now()
      and (p_parent is null or s.parent_id = p_parent)
      and s.state = 'saved' and public.scan_photo_is_active(s.state, s.created_at, s.expires_at)
      and c.state = 'ready' and c.printed_revision = s.printed_revision
      and jsonb_typeof(c.result->'sheetCheck') = 'number' and (c.result->>'sheetCheck')::numeric >= 1
      and coalesce(s.photo_check->>'state', '') <> 'pending'
      and not (coalesce(s.photo_check->>'state', '') = 'done' and coalesce(s.photo_check->>'problem', '') <> '')
    order by s.send_after, s.id
    limit greatest(1, least(coalesce(p_limit, 100), 200));
$function$;

revoke all on function public.hold_scan_photos(uuid, uuid[], integer) from public, anon, authenticated;
grant execute on function public.hold_scan_photos(uuid, uuid[], integer) to service_role;
revoke all on function public.unhold_scan_photos(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.unhold_scan_photos(uuid, uuid[]) to service_role;
revoke all on function public.due_scan_sends(uuid, integer) from public, anon, authenticated;
grant execute on function public.due_scan_sends(uuid, integer) to service_role;
