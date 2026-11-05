-- The Scan pages stack (spec #368, round r565). Additive: the live code keeps working before and after.
--
-- D-271: 40 photos per 10 minutes; 60 a day stays. Refused and retaken photos still count, and 2 uploads at once stays.
-- admit_scan_photo reads this row under the family's advisory lock in the same transaction as its counts, so the new
-- limit is admitted atomically with no change to the function.
alter table public.scan_limits alter column per_ten_minutes set default 40;
update public.scan_limits set per_ten_minutes = 40 where singleton;

-- D-270: Send records the ready pages as sent. Marking (S4) is not built yet: this only records the parent's send.
alter table public.scan_photos add column sent_at timestamptz;
grant select (sent_at) on public.scan_photos to authenticated;

-- Records the family's own ready pages of one child as sent, once. A page is ready when its photo is saved and active
-- and its calibration finished ready on the photo's own printing. Every other page in p_ids is left as it is, so Send
-- works while other pages are refused or still being checked. Answers the ids in p_ids that are now sent (a retry
-- answers the same and keeps the first time). Parent lock, then the photo rows in id order: the order of admission,
-- deletion and expiry.
create function public.send_scan_photos(p_parent uuid, p_child uuid, p_ids uuid[]) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare sent uuid[];
begin
  perform public.assert_family_writable(p_parent);
  if p_ids is null or cardinality(p_ids) = 0 then return '{}'; end if;
  if cardinality(p_ids) > 200 then raise exception 'too_many_pages'; end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:' || p_parent::text, 0));
  perform 1 from public.scan_photos where parent_id = p_parent and id = any(p_ids) order by id for update;
  update public.scan_photos s set sent_at = now()
    from public.scan_calibrations c
    where s.parent_id = p_parent and s.child_id = p_child and s.id = any(p_ids) and s.sent_at is null and s.state = 'saved'
      and public.scan_photo_is_active(s.state, s.created_at, s.expires_at)
      and c.photo_id = s.id and c.parent_id = s.parent_id and c.state = 'ready' and c.printed_revision = s.printed_revision;
  select coalesce(array_agg(id order by id), '{}') into sent from public.scan_photos
    where parent_id = p_parent and child_id = p_child and id = any(p_ids) and sent_at is not null and state = 'saved';
  return sent;
end $$;
revoke all on function public.send_scan_photos(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.send_scan_photos(uuid, uuid, uuid[]) to service_role;
